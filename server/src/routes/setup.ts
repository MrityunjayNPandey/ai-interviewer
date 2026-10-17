import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { AiUnavailableError, type AiClient } from "../ai/client";
import type { ModelRegistry } from "../ai/models";
import { requireHuman, type VerifyHuman } from "../http/botcheck";
import { candidateId, clientIp } from "../http/candidate";
import { pauseNewWork } from "../http/security";
import { HttpError } from "../http/errors";
import { matchMessages, profileMessages, requirementsMessages } from "../interview/prompts";
import {
  candidateProfileSchema,
  matchSchema,
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_RESUME_CHARS,
  roleRequirementsSchema,
} from "../interview/schemas";
import { researchRole } from "../research/briefing";
import type { SearchClient } from "../research/search";
import { createMeter, type Budget } from "../usage/meter";

/** Vercel caps request bodies at 4.5 MB. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
/** Resumes are a few pages; anything far longer isn't one, and costs CPU to parse. */
const MAX_PDF_PAGES = 20;

export type SetupRoutesOptions = {
  ai: AiClient;
  registry: ModelRegistry;
  budget: Budget;
  search: SearchClient | null;
  verifyHuman: VerifyHuman | null;
  now?: () => Date;
};

export const setupRoutes: FastifyPluginAsync<SetupRoutesOptions> = async (
  app,
  { ai, registry, budget, search, verifyHuman, now = () => new Date() }
) => {
  app.addHook("preHandler", pauseNewWork());
  // Every setup step costs AI tokens, web searches or PDF parsing, and none needs an interview first,
  // so each one needs a human: otherwise a script could spend the shared daily caps without one.
  app.addHook("preHandler", requireHuman(verifyHuman));
  const meter = (req: FastifyRequest) => createMeter(budget, { candidateId: candidateId(req), ip: clientIp(req) }, now());

  // Only this plugin accepts PDFs; the bytes are kept in memory and discarded after extraction.
  app.addContentTypeParser("application/pdf", { parseAs: "buffer", bodyLimit: MAX_PDF_BYTES }, (_req, body, done) =>
    done(null, body)
  );

  const parseModel = () => {
    const model = registry.parseModel();
    if (!model) throw new AiUnavailableError("none", "No AI provider is configured on the server.");
    return model;
  };

  // Only the extracted text is returned.
  app.post("/resume-text", async (req) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        throw new HttpError(415, "UNSUPPORTED_FILE", "Upload your resume as a PDF file.");
      }
      let text: string;
      try {
        const pdf = await getDocumentProxy(new Uint8Array(req.body));
        if (pdf.numPages > MAX_PDF_PAGES) {
          throw new HttpError(422, "UNSUPPORTED_FILE", `That PDF has ${pdf.numPages} pages. Upload a resume of up to ${MAX_PDF_PAGES} pages.`);
        }
        ({ text } = await extractText(pdf, { mergePages: true }));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(422, "UNSUPPORTED_FILE", "That file couldn't be read as a PDF. Try another file, or paste your resume as text.");
      }
      const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (cleaned.length < 50) {
        throw new HttpError(
          422,
          "UNSUPPORTED_FILE",
          "We couldn't find any text in that PDF. It may be a scanned image. Paste your resume as text instead."
        );
      }
      return { text: cleaned.slice(0, MAX_RESUME_CHARS) };
  });

  app.post("/parse", async (req) => {
    const { resumeText, jobDescription } = z
      .object({
        resumeText: z.string().trim().min(1, "Add your resume").max(MAX_RESUME_CHARS),
        jobDescription: z.string().trim().min(1, "Add the job description").max(MAX_JOB_DESCRIPTION_CHARS),
      })
      .parse(req.body);
    const model = parseModel();
    const usage = meter(req);
    await usage.aiCalls(model, 2);

    const [profile, requirements] = await Promise.all([
      ai.json(model, profileMessages(resumeText), candidateProfileSchema, usage.tokens),
      ai.json(model, requirementsMessages(jobDescription), roleRequirementsSchema, usage.tokens),
    ]);
    return { profile, requirements };
  });

  app.post("/match", async (req) => {
    const { profile, requirements } = z
      .object({ profile: candidateProfileSchema, requirements: roleRequirementsSchema })
      .parse(req.body);
    const model = parseModel();
    const usage = meter(req);
    await usage.aiCalls(model);

    const match = await ai.json(model, matchMessages(profile, requirements), matchSchema, usage.tokens);
    return { match };
  });

  /** Researches the company and role on the web. Cached for a week per company + role + seniority. */
  app.post("/research", async (req) => {
    const subject = z
      .object({
        title: z.string().trim().min(1, "Add the job title").max(160),
        company: z.string().trim().max(160).nullable().transform((value) => value || null),
        seniority: z.string().trim().max(80).nullable().transform((value) => value || null),
        refresh: z.boolean().optional(),
      })
      .parse(req.body);
    if (!search) throw new HttpError(503, "RESEARCH_UNAVAILABLE", "Web research isn't set up on this server.");

    const usage = meter(req);
    const model = parseModel();
    const { briefing, cached } = await researchRole({ search, ai, model }, subject, {
      refresh: subject.refresh,
      // Only a real search counts against the limits.
      onMiss: async (searchCount) => {
        await usage.searches(searchCount);
        await usage.aiCalls(model);
      },
      onTokens: usage.tokens,
    });
    return { briefing, cached };
  });

};

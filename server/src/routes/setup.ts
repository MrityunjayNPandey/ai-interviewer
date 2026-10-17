import express from "express";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { AiUnavailableError, type AiClient } from "../ai/client";
import type { ModelRegistry } from "../ai/models";
import { requireCandidate, usageKeys } from "../http/candidate";
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
import { consume, type Limits } from "../usage/limits";

/** Vercel caps request bodies at 4.5 MB. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export function setupRouter({
  ai,
  registry,
  limits,
  search,
}: {
  ai: AiClient;
  registry: ModelRegistry;
  limits: Limits;
  search: SearchClient | null;
}) {
  const router = express.Router();
  router.use(requireCandidate);

  const parseModel = () => {
    const model = registry.parseModel();
    if (!model) throw new AiUnavailableError("none", "No AI provider is configured on the server.");
    return model;
  };

  // The PDF is read in memory and discarded; only the extracted text is returned.
  router.post(
    "/resume-text",
    express.raw({ type: "application/pdf", limit: MAX_PDF_BYTES }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        throw new HttpError(415, "UNSUPPORTED_FILE", "Upload your resume as a PDF file.");
      }
      let text: string;
      try {
        const pdf = await getDocumentProxy(new Uint8Array(req.body));
        ({ text } = await extractText(pdf, { mergePages: true }));
      } catch {
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
      res.json({ text: cleaned.slice(0, MAX_RESUME_CHARS) });
    }
  );

  router.post("/parse", async (req, res) => {
    const { resumeText, jobDescription } = z
      .object({
        resumeText: z.string().trim().min(1, "Add your resume").max(MAX_RESUME_CHARS),
        jobDescription: z.string().trim().min(1, "Add the job description").max(MAX_JOB_DESCRIPTION_CHARS),
      })
      .parse(req.body);
    const model = parseModel();
    await consume(limits, "parses", usageKeys(req));

    const [profile, requirements] = await Promise.all([
      ai.json(model, profileMessages(resumeText), candidateProfileSchema),
      ai.json(model, requirementsMessages(jobDescription), roleRequirementsSchema),
    ]);
    res.json({ profile, requirements });
  });

  router.post("/match", async (req, res) => {
    const { profile, requirements } = z
      .object({ profile: candidateProfileSchema, requirements: roleRequirementsSchema })
      .parse(req.body);
    const model = parseModel();
    await consume(limits, "parses", usageKeys(req));

    const match = await ai.json(model, matchMessages(profile, requirements), matchSchema);
    res.json({ match });
  });

  /** Researches the company and role on the web. Cached for a week per company + role + seniority. */
  router.post("/research", async (req, res) => {
    const subject = z
      .object({
        title: z.string().trim().min(1, "Add the job title").max(160),
        company: z.string().trim().max(160).nullable().transform((value) => value || null),
        seniority: z.string().trim().max(80).nullable().transform((value) => value || null),
        refresh: z.boolean().optional(),
      })
      .parse(req.body);
    if (!search) throw new HttpError(503, "RESEARCH_UNAVAILABLE", "Web research isn't set up on this server.");

    const { briefing, cached } = await researchRole({ search, ai, model: parseModel() }, subject, {
      refresh: subject.refresh,
      // Only a real search counts against the daily limit.
      onMiss: () => consume(limits, "parses", usageKeys(req)),
    });
    res.json({ briefing, cached });
  });

  return router;
}

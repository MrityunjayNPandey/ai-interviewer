import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireHuman, type VerifyHuman } from "../http/botcheck";
import { candidateId, clientIp, requireCandidate } from "../http/candidate";
import { streamNdjson } from "../http/ndjson";
import { pauseNewWork } from "../http/security";
import { MAX_ANSWER_CHARS, MAX_COACH_MESSAGE_CHARS, setupSchema } from "../interview/schemas";
import { toSummary, toView, type InterviewService } from "../interview/service";
import { createMeter, type Budget } from "../usage/meter";

export type InterviewRoutesOptions = {
  service: InterviewService;
  budget: Budget;
  verifyHuman: VerifyHuman | null;
  now?: () => Date;
};

type WithId = { Params: { id: string } };

export const interviewRoutes: FastifyPluginAsync<InterviewRoutesOptions> = async (
  app,
  { service, budget, verifyHuman, now = () => new Date() }
) => {
  app.addHook("preHandler", requireCandidate);
  const meter = (req: FastifyRequest) => createMeter(budget, { candidateId: candidateId(req), ip: clientIp(req) }, now());
  const charge = (req: FastifyRequest) => () => meter(req).aiCalls(1);
  /** New work: paused in maintenance, and only for humans. */
  const startsWork = { preHandler: [pauseNewWork(), requireHuman(verifyHuman)] };

  app.get("/", async (req) => {
    const docs = await service.list(candidateId(req));
    return { interviews: docs.map(toSummary) };
  });

  app.post("/", startsWork, async (req, reply) => {
    const setup = setupSchema.parse(req.body);
    await meter(req).startInterview();
    const doc = await service.create(candidateId(req), setup);
    return reply.code(201).send({ interview: toView(doc) });
  });

  app.get<WithId>("/:id", async (req) => ({ interview: toView(await service.get(candidateId(req), req.params.id)) }));

  app.delete<WithId>("/:id", async (req, reply) => {
    await service.remove(candidateId(req), req.params.id);
    return reply.code(204).send();
  });

  /** Practise again: a new interview with the same setup. */
  app.post<WithId>("/:id/retake", startsWork, async (req, reply) => {
    const { id } = req.params;
    await service.get(candidateId(req), id); // 404 before counting against the limit
    await meter(req).startInterview();
    const doc = await service.retake(candidateId(req), id);
    return reply.code(201).send({ interview: toView(doc) });
  });

  app.put<WithId>("/:id/model", async (req) => {
    const { modelId } = z.object({ modelId: z.string().min(1) }).parse(req.body);
    return { interview: toView(await service.switchModel(candidateId(req), req.params.id, modelId)) };
  });

  app.post<WithId>("/:id/questions", async (req, reply) => {
    await streamNdjson(reply, async (onDelta) =>
      toView(await service.nextQuestion(candidateId(req), req.params.id, onDelta, charge(req)))
    );
    return reply;
  });

  app.post<WithId>("/:id/answers", async (req, reply) => {
    const { answer } = z
      .object({ answer: z.string().trim().min(1, "Write an answer first").max(MAX_ANSWER_CHARS) })
      .parse(req.body);
    await streamNdjson(reply, async (onDelta) =>
      toView(await service.answer(candidateId(req), req.params.id, answer, onDelta, charge(req)))
    );
    return reply;
  });

  app.post<WithId>("/:id/feedback", async (req, reply) => {
    await streamNdjson(reply, async (onDelta) =>
      toView(await service.retryFeedback(candidateId(req), req.params.id, onDelta, charge(req)))
    );
    return reply;
  });

  /** Coach mode: answer the latest question again. */
  app.post<WithId>("/:id/retry", async (req) => ({ interview: toView(await service.retry(candidateId(req), req.params.id)) }));

  /** Coach mode: ask the coach about the feedback on the latest answer. */
  app.post<WithId>("/:id/coach", async (req, reply) => {
    const { message } = z
      .object({ message: z.string().trim().min(1, "Write a message first").max(MAX_COACH_MESSAGE_CHARS) })
      .parse(req.body);
    await streamNdjson(reply, async (onDelta) =>
      toView(await service.askCoach(candidateId(req), req.params.id, message, onDelta, charge(req)))
    );
    return reply;
  });

  app.post<WithId>("/:id/end", async (req) => ({
    interview: toView(await service.end(candidateId(req), req.params.id, charge(req))),
  }));
};

import express from "express";
import { z } from "zod";
import { candidateId, requireCandidate, usageKeys } from "../http/candidate";
import { streamNdjson } from "../http/ndjson";
import { MAX_ANSWER_CHARS, MAX_COACH_MESSAGE_CHARS, setupSchema } from "../interview/schemas";
import { toSummary, toView, type InterviewService } from "../interview/service";
import { consume, type Limits } from "../usage/limits";

export function interviewsRouter({ service, limits }: { service: InterviewService; limits: Limits }) {
  const router = express.Router();
  router.use(requireCandidate);

  router.get("/", async (req, res) => {
    const docs = await service.list(candidateId(req));
    res.json({ interviews: docs.map(toSummary) });
  });

  router.post("/", async (req, res) => {
    const setup = setupSchema.parse(req.body);
    await consume(limits, "interviews", usageKeys(req));
    const doc = await service.create(candidateId(req), setup);
    res.status(201).json({ interview: toView(doc) });
  });

  router.get("/:id", async (req, res) => {
    res.json({ interview: toView(await service.get(candidateId(req), req.params.id)) });
  });

  router.delete("/:id", async (req, res) => {
    await service.remove(candidateId(req), req.params.id);
    res.status(204).end();
  });

  /** Practise again: a new interview with the same setup. */
  router.post("/:id/retake", async (req, res) => {
    await service.get(candidateId(req), req.params.id); // 404 before counting against the limit
    await consume(limits, "interviews", usageKeys(req));
    const doc = await service.retake(candidateId(req), req.params.id);
    res.status(201).json({ interview: toView(doc) });
  });

  router.put("/:id/model", async (req, res) => {
    const { modelId } = z.object({ modelId: z.string().min(1) }).parse(req.body);
    res.json({ interview: toView(await service.switchModel(candidateId(req), req.params.id, modelId)) });
  });

  router.post("/:id/questions", async (req, res) => {
    await streamNdjson(res, async (onDelta) =>
      toView(await service.nextQuestion(candidateId(req), req.params.id, onDelta))
    );
  });

  router.post("/:id/answers", async (req, res) => {
    const { answer } = z
      .object({ answer: z.string().trim().min(1, "Write an answer first").max(MAX_ANSWER_CHARS) })
      .parse(req.body);
    await streamNdjson(res, async (onDelta) =>
      toView(await service.answer(candidateId(req), req.params.id, answer, onDelta))
    );
  });

  router.post("/:id/feedback", async (req, res) => {
    await streamNdjson(res, async (onDelta) =>
      toView(await service.retryFeedback(candidateId(req), req.params.id, onDelta))
    );
  });

  /** Coach mode: answer the latest question again. */
  router.post("/:id/retry", async (req, res) => {
    res.json({ interview: toView(await service.retry(candidateId(req), req.params.id)) });
  });

  /** Coach mode: ask the coach about the feedback on the latest answer. */
  router.post("/:id/coach", async (req, res) => {
    const { message } = z
      .object({ message: z.string().trim().min(1, "Write a message first").max(MAX_COACH_MESSAGE_CHARS) })
      .parse(req.body);
    await streamNdjson(res, async (onDelta) =>
      toView(await service.askCoach(candidateId(req), req.params.id, message, onDelta))
    );
  });

  router.post("/:id/end", async (req, res) => {
    res.json({ interview: toView(await service.end(candidateId(req), req.params.id)) });
  });

  return router;
}

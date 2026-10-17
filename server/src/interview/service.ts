import mongoose from "mongoose";
import { AiUnavailableError, type AiClient } from "../ai/client";
import type { ModelConfig, ModelRegistry } from "../ai/models";
import { conflict, HttpError, notFound } from "../http/errors";
import type { Meter } from "../usage/meter";
import { InterviewModel, type InterviewDoc, type TurnDoc } from "./model";
import { coachChatMessages, feedbackMessages, questionMessages, reportMessages, type PromptTurn } from "./prompts";
import {
  MAX_COACH_MESSAGES,
  MAX_RETRIES,
  reportSchema,
  type InterviewSummary,
  type InterviewView,
  type Report,
  type Setup,
} from "./schemas";

/** A question still "generating" after this long is assumed abandoned (crashed or timed-out function). */
const STALE_QUESTION_MS = 90_000;

export type Deps = {
  ai: AiClient;
  registry: ModelRegistry;
  now?: () => Date;
};

type OnDelta = (text: string) => void;
/**
 * The usage budget for one request: `aiCalls(model)` right before each AI call throws when it's exhausted,
 * and `tokens` receives what each call used.
 */
export type Charge = Pick<Meter, "aiCalls" | "tokens">;

const isAsked = (turn: TurnDoc): turn is TurnDoc & { question: string } => turn.question !== null;

// ---- views ----

export function toView(doc: InterviewDoc): InterviewView {
  const hideFeedback = doc.setup.mode === "mock" && doc.status === "in_progress";
  return {
    id: doc._id.toString(),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt?.toISOString() ?? null,
    setup: doc.setup,
    turns: doc.turns.filter(isAsked).map((turn, index) => ({
      index,
      question: turn.question,
      answer: turn.answer ?? null,
      feedback: hideFeedback ? null : (turn.feedback ?? null),
      previousAttempts: (turn.previousAttempts ?? []).map((attempt) => ({ answer: attempt.answer, feedback: attempt.feedback })),
      coachMessages: (turn.coachMessages ?? []).map(({ role, content, attempt }) => ({ role, content, attempt })),
      modelId: turn.modelId,
    })),
    report: doc.report,
  };
}

export function toSummary(doc: InterviewDoc): InterviewSummary {
  return {
    id: doc._id.toString(),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    roleTitle: doc.setup.requirements.title,
    company: doc.setup.requirements.company,
    interviewType: doc.setup.interviewType,
    difficulty: doc.setup.difficulty,
    length: doc.setup.length,
    answeredCount: doc.turns.filter((turn) => turn.answer).length,
    overallScore: doc.report?.overallScore ?? null,
  };
}

// ---- service ----

export function createInterviewService({ ai, registry, now = () => new Date() }: Deps) {
  async function load(candidateId: string, id: string): Promise<InterviewDoc> {
    if (!mongoose.isValidObjectId(id)) throw notFound();
    const doc = await InterviewModel.findOne({ _id: id, candidateId }).lean<InterviewDoc>();
    if (!doc) throw notFound();
    return doc;
  }

  async function loadInProgress(candidateId: string, id: string) {
    const doc = await load(candidateId, id);
    if (doc.status !== "in_progress") throw conflict("This interview has already ended");
    return doc;
  }

  function requireModel(modelId: string): ModelConfig {
    const model = registry.find(modelId);
    if (!model) throw new HttpError(400, "INVALID_REQUEST", "That model isn't available. Choose another one.");
    return model;
  }

  /** The interview's current model; falls back to the default if its provider was unconfigured since. */
  function modelFor(doc: InterviewDoc): ModelConfig {
    const model = registry.find(doc.setup.modelId) ?? registry.defaultModel();
    if (!model) throw new AiUnavailableError(doc.setup.modelId, "No AI provider is configured on the server.");
    return model;
  }

  async function collect(stream: AsyncIterable<string>, onDelta?: OnDelta): Promise<string> {
    let text = "";
    for await (const delta of stream) {
      text += delta;
      onDelta?.(delta);
    }
    return text.trim();
  }

  async function generateFeedback(doc: InterviewDoc, index: number, charge: Charge, onDelta?: OnDelta): Promise<InterviewDoc> {
    const model = modelFor(doc);
    const turn = doc.turns[index] as PromptTurn;
    const feedback = await collect(ai.stream(model, feedbackMessages(doc.setup, turn), charge.tokens), onDelta);
    if (!feedback) throw new AiUnavailableError(model.id, `${model.label} returned an empty response. Try again, or switch models.`);

    const updated = await InterviewModel.findOneAndUpdate(
      { _id: doc._id },
      { $set: { [`turns.${index}.feedback`]: feedback } },
      { new: true }
    ).lean<InterviewDoc>();
    return updated ?? doc;
  }

  return {
    async create(candidateId: string, setup: Setup): Promise<InterviewDoc> {
      requireModel(setup.modelId);
      const doc = await InterviewModel.create({ candidateId, setup });
      return doc.toObject() as InterviewDoc;
    },

    async retake(candidateId: string, id: string): Promise<InterviewDoc> {
      const { setup } = await load(candidateId, id);
      const model = registry.find(setup.modelId) ?? registry.defaultModel();
      if (!model) throw new AiUnavailableError(setup.modelId, "No AI provider is configured on the server.");
      const doc = await InterviewModel.create({ candidateId, setup: { ...setup, modelId: model.id } });
      return doc.toObject() as InterviewDoc;
    },

    get: load,

    async list(candidateId: string): Promise<InterviewDoc[]> {
      return InterviewModel.find({ candidateId }).sort({ createdAt: -1 }).limit(100).lean<InterviewDoc[]>();
    },

    async remove(candidateId: string, id: string): Promise<void> {
      if (!mongoose.isValidObjectId(id)) throw notFound();
      const { deletedCount } = await InterviewModel.deleteOne({ _id: id, candidateId });
      if (!deletedCount) throw notFound();
    },

    async switchModel(candidateId: string, id: string, modelId: string): Promise<InterviewDoc> {
      requireModel(modelId);
      const doc = await InterviewModel.findOneAndUpdate(
        { _id: id, candidateId, status: "in_progress" },
        { $set: { "setup.modelId": modelId } },
        { new: true }
      ).lean<InterviewDoc>();
      if (!doc) {
        await load(candidateId, id); // 404 if it doesn't exist
        throw conflict("This interview has already ended");
      }
      return doc;
    },

    /**
     * Asks the next question, streaming it through `onDelta`. If a question is already waiting for
     * an answer (e.g. after a page refresh), returns it without generating a new one.
     */
    async nextQuestion(candidateId: string, id: string, onDelta: OnDelta, charge: Charge): Promise<InterviewDoc> {
      const doc = await loadInProgress(candidateId, id);
      const turns = doc.turns;
      const last = turns.at(-1);
      const current = now();
      let index = turns.length;

      if (last && isAsked(last) && !last.answer) return doc;

      const model = modelFor(doc);

      if (last && !isAsked(last)) {
        // A placeholder: another request is generating, or one died mid-way and can be reclaimed.
        if (current.getTime() - last.questionStartedAt.getTime() < STALE_QUESTION_MS) {
          throw conflict("The next question is already being generated");
        }
        index = turns.length - 1;
        await charge.aiCalls(model);
        const reclaimed = await InterviewModel.updateOne(
          { _id: doc._id, [`turns.${index}.questionStartedAt`]: last.questionStartedAt },
          { $set: { [`turns.${index}.questionStartedAt`]: current } }
        );
        if (!reclaimed.modifiedCount) throw conflict("The next question is already being generated");
      } else {
        if (turns.length >= doc.setup.length) throw conflict("All questions have been answered. End the interview to see your report.");
        await charge.aiCalls(model);
        // Reserve the slot atomically so concurrent requests can't both add a question.
        const reserved = await InterviewModel.updateOne(
          { _id: doc._id, status: "in_progress", turns: { $size: turns.length } },
          { $push: { turns: { question: null, questionStartedAt: current, modelId: model.id } } }
        );
        if (!reserved.modifiedCount) throw conflict("The next question is already being generated");
      }

      try {
        const asked = turns.slice(0, index) as PromptTurn[];
        const question = await collect(ai.stream(model, questionMessages(doc.setup, asked), charge.tokens), onDelta);
        if (!question) throw new AiUnavailableError(model.id, `${model.label} returned an empty response. Try again, or switch models.`);

        const updated = await InterviewModel.findOneAndUpdate(
          { _id: doc._id, [`turns.${index}.question`]: { $type: "null" } },
          { $set: { [`turns.${index}.question`]: question, [`turns.${index}.modelId`]: model.id } },
          { new: true }
        ).lean<InterviewDoc>();
        if (!updated) throw conflict("This interview changed while the question was being generated");
        return updated;
      } catch (error) {
        // Release the slot so the candidate can retry, possibly with another model.
        await InterviewModel.updateOne(
          { _id: doc._id, turns: { $size: index + 1 }, [`turns.${index}.question`]: { $type: "null" } },
          { $pop: { turns: 1 } }
        );
        throw error;
      }
    },

    /**
     * Saves the answer to the waiting question, then generates feedback. In coach mode the feedback
     * streams through `onDelta`; in mock mode it is generated silently and a failure doesn't block the interview.
     */
    async answer(candidateId: string, id: string, answer: string, onDelta: OnDelta, charge: Charge): Promise<InterviewDoc> {
      const doc = await loadInProgress(candidateId, id);
      const index = doc.turns.length - 1;
      const last = doc.turns[index];
      if (!last || !isAsked(last) || last.answer) throw conflict("There is no question waiting for an answer");
      await charge.aiCalls(modelFor(doc)); // for the feedback

      const updated = await InterviewModel.findOneAndUpdate(
        {
          _id: doc._id,
          status: "in_progress",
          // `$type`, not `null` / `$ne: null`: on an array path Mongo also reads `turns.N` as a field on every element,
          // so plain null comparisons match (or fail) on those phantom values.
          [`turns.${index}.answer`]: { $type: "null" },
          [`turns.${index}.question`]: { $type: "string" },
        },
        { $set: { [`turns.${index}.answer`]: answer, [`turns.${index}.answeredAt`]: now() } },
        { new: true }
      ).lean<InterviewDoc>();
      if (!updated) throw conflict("This question was already answered");

      if (updated.setup.mode === "mock") {
        try {
          return await generateFeedback(updated, index, charge);
        } catch (error) {
          if (error instanceof AiUnavailableError) return updated; // The report still covers this answer.
          throw error;
        }
      }
      return generateFeedback(updated, index, charge, onDelta);
    },

    /** Retries feedback for the latest answer after a failure. */
    async retryFeedback(candidateId: string, id: string, onDelta: OnDelta, charge: Charge): Promise<InterviewDoc> {
      const doc = await loadInProgress(candidateId, id);
      const index = doc.turns.length - 1;
      const last = doc.turns[index];
      if (!last?.answer || last.feedback) throw conflict("There is no answer waiting for feedback");
      await charge.aiCalls(modelFor(doc));
      return generateFeedback(doc, index, charge, doc.setup.mode === "coach" ? onDelta : undefined);
    },

    /**
     * Coach mode: reopens the latest question for another attempt. The current answer and its feedback
     * move to `previousAttempts`, and the question waits for an answer again.
     */
    async retry(candidateId: string, id: string): Promise<InterviewDoc> {
      const doc = await loadInProgress(candidateId, id);
      if (doc.setup.mode !== "coach") throw conflict("Retries are only available in coach mode");
      const index = doc.turns.length - 1;
      const last = doc.turns[index];
      if (!last?.answer || !last.answeredAt) throw conflict("Answer the question before trying again");
      if ((last.previousAttempts ?? []).length >= MAX_RETRIES) {
        throw conflict(`You can retry a question up to ${MAX_RETRIES} times`);
      }

      const updated = await InterviewModel.findOneAndUpdate(
        // Matching on answeredAt makes this a no-op for a second, racing request.
        { _id: doc._id, status: "in_progress", turns: { $size: index + 1 }, [`turns.${index}.answeredAt`]: last.answeredAt },
        {
          $push: { [`turns.${index}.previousAttempts`]: { answer: last.answer, feedback: last.feedback, answeredAt: last.answeredAt } },
          $set: { [`turns.${index}.answer`]: null, [`turns.${index}.answeredAt`]: null, [`turns.${index}.feedback`]: null },
        },
        { new: true }
      ).lean<InterviewDoc>();
      if (!updated) throw conflict("This question was already reopened");
      return updated;
    },

    /** Coach mode: answers the candidate's question about the feedback on the latest answer, streaming the reply. */
    async askCoach(candidateId: string, id: string, message: string, onDelta: OnDelta, charge: Charge): Promise<InterviewDoc> {
      const doc = await loadInProgress(candidateId, id);
      if (doc.setup.mode !== "coach") throw conflict("The coach chat is only available in coach mode");
      const index = doc.turns.length - 1;
      const turn = doc.turns[index];
      if (!turn || !isAsked(turn) || !turn.answer || !turn.feedback) {
        throw conflict("The coach can answer questions once there's feedback on your answer");
      }
      const chat = turn.coachMessages ?? [];
      if (chat.filter((entry) => entry.role === "candidate").length >= MAX_COACH_MESSAGES) {
        throw conflict(`You can ask the coach up to ${MAX_COACH_MESSAGES} questions per interview question`);
      }

      const model = modelFor(doc);
      await charge.aiCalls(model);
      const attempt = (turn.previousAttempts ?? []).length;
      // Reserve: append the candidate's message only if nobody else did meanwhile (one reply at a time).
      const path = `turns.${index}.coachMessages`;
      // Interviews created before the coach chat existed have no array yet.
      const unchanged = chat.length ? { [path]: { $size: chat.length } } : { $or: [{ [path]: { $size: 0 } }, { [path]: { $exists: false } }] };
      const reserved = await InterviewModel.updateOne(
        { _id: doc._id, status: "in_progress", turns: { $size: index + 1 }, ...unchanged },
        { $push: { [`turns.${index}.coachMessages`]: { role: "candidate", content: message, attempt, createdAt: now() } } }
      );
      if (!reserved.modifiedCount) throw conflict("The coach is still replying to your last message");

      try {
        const reply = await collect(ai.stream(model, coachChatMessages(doc.setup, turn, chat, message), charge.tokens), onDelta);
        if (!reply) throw new AiUnavailableError(model.id, `${model.label} returned an empty response. Try again, or switch models.`);
        const updated = await InterviewModel.findOneAndUpdate(
          { _id: doc._id, [`turns.${index}.coachMessages`]: { $size: chat.length + 1 } },
          { $push: { [`turns.${index}.coachMessages`]: { role: "coach", content: reply, attempt, createdAt: now() } } },
          { new: true }
        ).lean<InterviewDoc>();
        if (!updated) throw conflict("This interview changed while the coach was replying");
        return updated;
      } catch (error) {
        // Remove the unanswered message so it doesn't count against the limit.
        await InterviewModel.updateOne(
          { _id: doc._id, [`turns.${index}.coachMessages`]: { $size: chat.length + 1 } },
          { $pop: { [`turns.${index}.coachMessages`]: 1 } }
        );
        throw error;
      }
    },

    /** Ends the interview and writes the report, covering only the answered questions. */
    async end(candidateId: string, id: string, charge: Charge): Promise<InterviewDoc> {
      const doc = await load(candidateId, id);
      if (doc.status === "completed") return doc;

      // A retry that was requested but never answered falls back to the attempt before it.
      const asked = doc.turns.filter(isAsked).map(restorePendingRetry);
      const answered = asked.filter((turn) => turn.answer);
      if (!answered.length) throw conflict("Answer at least one question before ending the interview");

      const model = modelFor(doc);
      await charge.aiCalls(model);
      const report = normalizeReport(await ai.json(model, reportMessages(doc.setup, answered), reportSchema, charge.tokens), answered.length);

      const updated = await InterviewModel.findOneAndUpdate(
        { _id: doc._id, status: "in_progress" },
        {
          $set: {
            status: "completed",
            completedAt: now(),
            report: { ...report, modelId: model.id },
            // Drop a question still being generated; it was never shown.
            turns: asked,
          },
        },
        { new: true }
      ).lean<InterviewDoc>();
      return updated ?? load(candidateId, id);
    },
  };
}

export type InterviewService = ReturnType<typeof createInterviewService>;

function restorePendingRetry<T extends TurnDoc>(turn: T): T {
  const attempts = turn.previousAttempts ?? [];
  const latest = attempts.at(-1);
  if (turn.answer || !latest) return turn;
  return { ...turn, answer: latest.answer, feedback: latest.feedback, answeredAt: latest.answeredAt, previousAttempts: attempts.slice(0, -1) };
}

/** Keeps one report entry per answered question, in order, and tidies scores. */
export function normalizeReport(report: Report, answeredCount: number): Report {
  const round = (score: number) => Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
  const byIndex = new Map(report.questions.map((entry) => [entry.index, entry]));
  const questions = Array.from({ length: answeredCount }, (_, index) => {
    const entry = byIndex.get(index);
    return entry
      ? { ...entry, index, score: round(entry.score) }
      : { index, score: 0, note: "No assessment was produced for this answer.", strongAnswer: "" };
  });
  return { ...report, overallScore: round(report.overallScore), questions };
}

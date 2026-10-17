import mongoose, { Schema } from "mongoose";
import type { InterviewStatus, Report, Setup } from "./schemas";

// One document per interview. `setup` and `report` are validated with zod at the API boundary,
// so Mongo stores them as plain objects.
const attemptSchema = new Schema(
  {
    answer: { type: String, required: true },
    feedback: { type: String, default: null },
    answeredAt: { type: Date, required: true },
  },
  { _id: false }
);

const coachMessageSchema = new Schema(
  {
    role: { type: String, enum: ["candidate", "coach"], required: true },
    content: { type: String, required: true },
    attempt: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const turnSchema = new Schema(
  {
    /** Null while the question is still being generated. */
    question: { type: String, default: null },
    questionStartedAt: { type: Date, required: true },
    answer: { type: String, default: null },
    answeredAt: { type: Date, default: null },
    feedback: { type: String, default: null },
    /** Earlier attempts at this question, oldest first; `answer`/`feedback` above hold the latest. */
    previousAttempts: { type: [attemptSchema], default: [] },
    coachMessages: { type: [coachMessageSchema], default: [] },
    /** The model that asked this question (and gave its feedback). */
    modelId: { type: String, required: true },
  },
  { _id: false }
);

const interviewSchema = new Schema(
  {
    candidateId: { type: String, required: true, index: true },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    setup: { type: Schema.Types.Mixed, required: true },
    turns: { type: [turnSchema], default: [] },
    report: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "practice_interviews", minimize: false }
);

export type AttemptDoc = { answer: string; feedback: string | null; answeredAt: Date };

export type CoachMessageDoc = { role: "candidate" | "coach"; content: string; attempt: number; createdAt: Date };

export type TurnDoc = {
  question: string | null;
  questionStartedAt: Date;
  answer: string | null;
  answeredAt: Date | null;
  feedback: string | null;
  /** Missing on documents written before retries existed. */
  previousAttempts?: AttemptDoc[];
  coachMessages?: CoachMessageDoc[];
  modelId: string;
};

/** An interview as read with `.lean()`. */
export type InterviewDoc = {
  _id: mongoose.Types.ObjectId;
  candidateId: string;
  status: InterviewStatus;
  setup: Setup;
  turns: TurnDoc[];
  report: (Report & { modelId: string }) | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const InterviewModel = mongoose.model("Interview", interviewSchema);

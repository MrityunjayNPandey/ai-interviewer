import mongoose, { Schema } from "mongoose";
import { HttpError } from "../http/errors";

// Daily counters, per candidate and per IP, so one person can't exhaust the shared free API keys.
const usageSchema = new Schema(
  {
    key: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
    // Lets Mongo delete old counters on its own.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { collection: "usage" }
);
usageSchema.index({ key: 1, day: 1 }, { unique: true });

const UsageModel = mongoose.model("Usage", usageSchema);

export type LimitName = "interviews" | "parses";

export type Limits = Record<LimitName, number>;

export const DEFAULT_LIMITS: Limits = {
  interviews: 5,
  // Each setup parses once, plus re-parses and match refreshes after edits.
  parses: 30,
};

const MESSAGES: Record<LimitName, (limit: number) => string> = {
  interviews: (limit) => `You've started ${limit} interviews today, which is the daily limit. Come back tomorrow!`,
  parses: () => "You've reached today's limit for reading resumes and job descriptions. Come back tomorrow!",
};

/**
 * Counts one use of `name` against every key (e.g. candidate and IP), or throws DAILY_LIMIT
 * without counting if any key is already at the limit.
 */
export async function consume(limits: Limits, name: LimitName, keys: string[], now = new Date()) {
  const limit = limits[name];
  const day = now.toISOString().slice(0, 10);
  const scoped = keys.map((key) => `${name}:${key}`);

  const existing = await UsageModel.find({ key: { $in: scoped }, day }).lean();
  if (existing.some((usage) => usage.count >= limit)) {
    throw new HttpError(429, "DAILY_LIMIT", MESSAGES[name](limit));
  }

  const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  await UsageModel.bulkWrite(
    scoped.map((key) => ({
      updateOne: {
        filter: { key, day },
        update: { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        upsert: true,
      },
    }))
  );
}

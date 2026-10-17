import mongoose, { Schema } from "mongoose";
import { HttpError } from "../http/errors";

/**
 * Usage budgets that keep the shared free API keys usable for everyone.
 * Per-person limits stop one candidate (or IP) from hogging capacity; global caps stay safely
 * under the providers' free quotas, so the app degrades with a clear message instead of failing.
 */
export type Budget = {
  interviewsPerCandidate: number;
  interviewsPerIp: number;
  aiCallsPerCandidate: number;
  aiCallsPerIp: number;
  /** Burst limit, per candidate and per IP. */
  aiCallsPerMinute: number;
  /** Across all users. Groq's free tier allows ~1,000 requests a day per model. */
  aiCallsGlobal: number;
  /** Web searches across all users (cache misses only). Tavily's free tier is ~1,000 a month. */
  searchesGlobal: number;
};

export const DEFAULT_BUDGET: Budget = {
  interviewsPerCandidate: 5,
  interviewsPerIp: 5,
  aiCallsPerCandidate: 120,
  aiCallsPerIp: 200,
  aiCallsPerMinute: 20,
  aiCallsGlobal: 800,
  searchesGlobal: 30,
};

/** Reads overrides such as DAILY_AI_CALLS=600 from the environment. */
export function budgetFromEnv(env: NodeJS.ProcessEnv = process.env): Budget {
  const read = (name: string, fallback: number) => {
    const raw = env[name];
    const value = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    interviewsPerCandidate: read("DAILY_INTERVIEWS_PER_CANDIDATE", DEFAULT_BUDGET.interviewsPerCandidate),
    interviewsPerIp: read("DAILY_INTERVIEWS_PER_IP", DEFAULT_BUDGET.interviewsPerIp),
    aiCallsPerCandidate: read("DAILY_AI_CALLS_PER_CANDIDATE", DEFAULT_BUDGET.aiCallsPerCandidate),
    aiCallsPerIp: read("DAILY_AI_CALLS_PER_IP", DEFAULT_BUDGET.aiCallsPerIp),
    aiCallsPerMinute: read("AI_CALLS_PER_MINUTE", DEFAULT_BUDGET.aiCallsPerMinute),
    aiCallsGlobal: read("DAILY_AI_CALLS", DEFAULT_BUDGET.aiCallsGlobal),
    searchesGlobal: read("DAILY_SEARCHES", DEFAULT_BUDGET.searchesGlobal),
  };
}

const counterSchema = new Schema(
  {
    key: { type: String, required: true },
    window: { type: String, required: true },
    count: { type: Number, default: 0 },
    // Lets Mongo delete old counters on its own.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { collection: "usage_counters" }
);
counterSchema.index({ key: 1, window: 1 }, { unique: true });
const CounterModel = mongoose.model("UsageCounter", counterSchema);

type Check = { key: string; window: string; limit: number; ttlMs: number; error: () => HttpError };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Counts `amount` against every check, or throws the first exceeded check's error without counting.
 * (Two requests racing at the very edge can both pass; for budgets this size that's acceptable.)
 */
async function charge(checks: Check[], amount: number, now: Date) {
  const existing = await CounterModel.find({ $or: checks.map(({ key, window }) => ({ key, window })) }).lean();
  for (const check of checks) {
    const used = existing.find((counter) => counter.key === check.key && counter.window === check.window)?.count ?? 0;
    if (used + amount > check.limit) throw check.error();
  }
  await CounterModel.bulkWrite(
    checks.map(({ key, window, ttlMs }) => ({
      updateOne: {
        filter: { key, window },
        update: { $inc: { count: amount }, $setOnInsert: { expiresAt: new Date(now.getTime() + ttlMs) } },
        upsert: true,
      },
    }))
  );
}

const dailyLimit = (message: string) => () => new HttpError(429, "DAILY_LIMIT", message);
const slowDown = () => new HttpError(429, "RATE_LIMITED", "You're going a little fast. Wait a minute, then try again.");
const atCapacity = () =>
  new HttpError(
    503,
    "CAPACITY",
    "We've used up today's free AI capacity across everyone using the app. Please come back tomorrow."
  );

export type Meter = {
  /** Counts a new interview (or practising again). */
  startInterview(): Promise<void>;
  /** Counts AI calls before they are made. */
  aiCalls(amount?: number): Promise<void>;
  /** Counts uncached web searches. */
  searches(amount: number): Promise<void>;
};

export function createMeter(budget: Budget, subject: { candidateId: string; ip: string }, now = new Date()): Meter {
  const day = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(0, 16);
  const candidate = `candidate:${subject.candidateId}`;
  const ip = `ip:${subject.ip}`;
  const daily = (key: string, limit: number, error: () => HttpError): Check => ({
    key,
    window: day,
    limit,
    ttlMs: 2 * DAY_MS,
    error,
  });
  const perMinute = (key: string): Check => ({
    key,
    window: minute,
    limit: budget.aiCallsPerMinute,
    ttlMs: 5 * 60_000,
    error: slowDown,
  });

  return {
    startInterview: () =>
      charge(
        [
          daily(
            `interviews:${candidate}`,
            budget.interviewsPerCandidate,
            dailyLimit(`You've started ${budget.interviewsPerCandidate} interviews today, which is the daily limit. Come back tomorrow!`)
          ),
          daily(`interviews:${ip}`, budget.interviewsPerIp, dailyLimit("Today's interview limit for your network has been reached. Come back tomorrow!")),
        ],
        1,
        now
      ),
    aiCalls: (amount = 1) =>
      charge(
        [
          perMinute(`ai-minute:${candidate}`),
          perMinute(`ai-minute:${ip}`),
          daily(`ai:${candidate}`, budget.aiCallsPerCandidate, dailyLimit("You've reached today's practice limit. Come back tomorrow!")),
          daily(`ai:${ip}`, budget.aiCallsPerIp, dailyLimit("Today's practice limit for your network has been reached. Come back tomorrow!")),
          daily("ai:global", budget.aiCallsGlobal, atCapacity),
        ],
        amount,
        now
      ),
    searches: (amount) => charge([daily("searches:global", budget.searchesGlobal, atCapacity)], amount, now),
  };
}

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
  /** Daily AI tokens (prompt + completion) per candidate. */
  tokensPerCandidate: number;
  tokensPerIp: number;
  /** Burst limit in AI calls, per candidate and per IP: providers rate-limit requests per minute. */
  aiCallsPerMinute: number;
  /** Daily AI tokens across all users; keep it under the providers' free daily token quotas. */
  tokensGlobal: number;
  /** Web searches across all users (cache misses only). Tavily's free tier is ~1,000 a month. */
  searchesGlobal: number;
};

export const DEFAULT_BUDGET: Budget = {
  interviewsPerCandidate: 5,
  interviewsPerIp: 5,
  tokensPerCandidate: 150_000,
  tokensPerIp: 300_000,
  aiCallsPerMinute: 20,
  tokensGlobal: 1_500_000,
  searchesGlobal: 30,
};

/** Reads overrides such as DAILY_TOKENS=2000000 from the environment. */
export function budgetFromEnv(env: NodeJS.ProcessEnv = process.env): Budget {
  const read = (name: string, fallback: number) => {
    const raw = env[name];
    const value = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    interviewsPerCandidate: read("DAILY_INTERVIEWS_PER_CANDIDATE", DEFAULT_BUDGET.interviewsPerCandidate),
    interviewsPerIp: read("DAILY_INTERVIEWS_PER_IP", DEFAULT_BUDGET.interviewsPerIp),
    tokensPerCandidate: read("DAILY_TOKENS_PER_CANDIDATE", DEFAULT_BUDGET.tokensPerCandidate),
    tokensPerIp: read("DAILY_TOKENS_PER_IP", DEFAULT_BUDGET.tokensPerIp),
    aiCallsPerMinute: read("AI_CALLS_PER_MINUTE", DEFAULT_BUDGET.aiCallsPerMinute),
    tokensGlobal: read("DAILY_TOKENS", DEFAULT_BUDGET.tokensGlobal),
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

/** Throws the first check's error whose counter has no room for its amount. */
async function ensureRoom(checks: { check: Check; amount: number }[]) {
  const existing = await CounterModel.find({ $or: checks.map(({ check: { key, window } }) => ({ key, window })) }).lean();
  for (const { check, amount } of checks) {
    const used = existing.find((counter) => counter.key === check.key && counter.window === check.window)?.count ?? 0;
    if (used + amount > check.limit) throw check.error();
  }
}

async function add(checks: Check[], amount: number, now: Date) {
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

/**
 * Counts `amount` against every check, or throws the first exceeded check's error without counting.
 * (Two requests racing at the very edge can both pass; for budgets this size that's acceptable.)
 */
async function charge(checks: Check[], amount: number, now: Date) {
  await ensureRoom(checks.map((check) => ({ check, amount })));
  await add(checks, amount, now);
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
  /**
   * Right before AI calls: throws when a daily token budget is used up, and counts the calls against
   * the per-minute limit. A call's tokens are known only once it finishes, so the last one may overshoot.
   */
  aiCalls(calls?: number): Promise<void>;
  /** After an AI call: adds the tokens it used to the daily budgets. */
  tokens(count: number): Promise<void>;
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

  const tokenChecks = [
    daily(`tokens:${candidate}`, budget.tokensPerCandidate, dailyLimit("You've reached today's practice limit. Come back tomorrow!")),
    daily(`tokens:${ip}`, budget.tokensPerIp, dailyLimit("Today's practice limit for your network has been reached. Come back tomorrow!")),
    daily("tokens:global", budget.tokensGlobal, atCapacity),
  ];

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
    aiCalls: async (calls = 1) => {
      const burst = [perMinute(`ai-minute:${candidate}`), perMinute(`ai-minute:${ip}`)];
      await ensureRoom([...burst.map((check) => ({ check, amount: calls })), ...tokenChecks.map((check) => ({ check, amount: 1 }))]);
      await add(burst, calls, now);
    },
    tokens: (count) => add(tokenChecks, count, now),
    searches: (amount) => charge([daily("searches:global", budget.searchesGlobal, atCapacity)], amount, now),
  };
}

import { randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll } from "vitest";
import type { ZodType } from "zod";
import { createApp, type AppOptions } from "../src/app";
import { AiUnavailableError, type AiClient, type ChatMessage } from "../src/ai/client";
import { createModelRegistry } from "../src/ai/models";
import type { Setup, StreamEvent } from "../src/interview/schemas";

/** Starts an in-memory MongoDB for the test file and clears it between tests. */
export function useDatabase() {
  let server: MongoMemoryServer;
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
  });
  afterEach(async () => {
    await mongoose.connection.db?.dropDatabase();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });
}

type StreamHandler = (model: string, messages: ChatMessage[]) => string | Error | Promise<string | Error>;
type JsonHandler = (model: string, messages: ChatMessage[]) => unknown;

/** A scripted AI client. Records every call; streams responses word by word. */
export function fakeAi(handlers: { stream?: StreamHandler; json?: JsonHandler } = {}) {
  const calls: { kind: "stream" | "json"; model: string; messages: ChatMessage[] }[] = [];
  let questionCount = 0;

  const defaultStream: StreamHandler = (_model, messages) => {
    const last = messages.at(-1)?.content ?? "";
    if (last.includes("Give me feedback")) return "Good structure. Add a concrete metric next time.";
    questionCount++;
    return `Question ${questionCount}: tell me about a project you are proud of.`;
  };

  const client: AiClient & { calls: typeof calls } = {
    calls,
    async *stream(model, messages) {
      calls.push({ kind: "stream", model: model.id, messages });
      const result = await (handlers.stream ?? defaultStream)(model.id, messages);
      if (result instanceof Error) throw result;
      for (const word of result.split(/(?<= )/)) yield word;
    },
    async json<T>(model: { id: string }, messages: ChatMessage[], schema: ZodType<T>) {
      calls.push({ kind: "json", model: model.id, messages });
      const value = handlers.json ? handlers.json(model.id, messages) : defaultJson(messages);
      if (value instanceof Error) throw value;
      return schema.parse(value);
    },
  };
  return client;
}

function defaultJson(messages: ChatMessage[]): unknown {
  const system = messages[0]?.content ?? "";
  if (system.includes("end-of-interview report")) {
    const transcript = JSON.parse(messages[1]!.content.replace("Transcript:\n", "")) as unknown[];
    return {
      overallScore: 7.25,
      summary: "You communicated clearly.",
      strengths: ["Clear structure"],
      improvements: [{ area: "Impact", suggestion: "Quantify results." }],
      questions: transcript.map((_, index) => ({ index, score: 7, note: "Solid.", strongAnswer: "Mention metrics." })),
    };
  }
  if (system.includes("structured profile")) return profile;
  if (system.includes("requirements from the job description")) return requirements;
  if (system.includes("Compare the candidate profile")) return match;
  throw new Error(`fakeAi: no JSON response scripted for: ${system.slice(0, 80)}`);
}

export const unavailable = (modelId = "groq:openai/gpt-oss-120b") =>
  new AiUnavailableError(modelId, "GPT-OSS 120B has hit its rate limit. Try again, or switch to another model.");

export type FakeAi = ReturnType<typeof fakeAi>;

/** All providers configured, so every model is available. */
export const registry = createModelRegistry({
  GROQ_API_KEY: "test",
  MISTRAL_API_KEY: "test",
  GEMINI_API_KEY: "test",
  OPENROUTER_API_KEY: "test",
});

export function testApp(options: Omit<AppOptions, "ai"> & { ai?: FakeAi } = {}) {
  const ai = options.ai ?? fakeAi();
  const app = createApp({ registry, connect: async () => {}, ...options, ai });
  return { app, ai };
}

export const profile = {
  name: "Jane Doe",
  headline: "Backend Engineer",
  yearsOfExperience: 4,
  skills: ["Node.js", "MongoDB"],
  experience: [{ title: "Backend Engineer", company: "Acme", period: "2021-2025", highlights: ["Built REST APIs"] }],
  projects: [],
  education: [],
};

export const requirements = {
  title: "Senior Backend Engineer",
  company: "Globex",
  seniority: "Senior",
  mustHave: ["Node.js", "Distributed systems"],
  niceToHave: [],
  responsibilities: ["Own the API platform"],
};

export const match = { summary: "You fit well.", strengths: ["Node.js"], gaps: ["Distributed systems"] };

export function setupFixture(overrides: Partial<Setup> = {}): Setup {
  return {
    resumeText: "Jane Doe. Backend engineer, 4 years of Node.js.",
    jobDescription: "Senior Backend Engineer at Globex.",
    profile,
    requirements,
    match,
    interviewType: "mixed",
    difficulty: "mid",
    length: 3,
    mode: "coach",
    modelId: "groq:openai/gpt-oss-120b",
    ...overrides,
  };
}

/** A supertest agent that sends a fixed candidate id. */
export function asCandidate(app: ReturnType<typeof createApp>, id = randomUUID()) {
  const withId = (test: request.Test) => test.set("X-Candidate-Id", id);
  return {
    id,
    get: (url: string) => withId(request(app).get(url)),
    post: (url: string, body?: object) => withId(request(app).post(url)).send(body),
    put: (url: string, body?: object) => withId(request(app).put(url)).send(body),
    delete: (url: string) => withId(request(app).delete(url)),
    /** POSTs to a streaming endpoint; the raw NDJSON (or JSON error) text lands in `res.body`. */
    stream: (url: string, body?: object) =>
      withId(request(app).post(url))
        .send(body)
        .buffer(true)
        .parse((res, callback) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => callback(null, data));
        }),
  };
}

export function parseEvents(text: string): StreamEvent[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StreamEvent);
}

export function doneEvent(text: string) {
  const done = parseEvents(text).find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error(`no done event in: ${text}`);
  return done.interview;
}

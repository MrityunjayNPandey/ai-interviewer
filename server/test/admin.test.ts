import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createModelRegistry, MODELS } from "../src/ai/models";
import { asCandidate, setupFixture, testApp, useDatabase, type TestApp } from "./helpers";

useDatabase();

const TOKEN = "a".repeat(32);

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

const usage = (app: TestApp, token: string | null = TOKEN, query = "") => {
  const test = request(app).get(`/api/admin/usage${query}`);
  return token === null ? test : test.set("Authorization", `Bearer ${token}`);
};

async function answerOneQuestion(candidate: ReturnType<typeof asCandidate>, modelId?: string) {
  const id = (await candidate.post("/api/interviews", setupFixture(modelId ? { modelId } : {})).expect(201)).body.interview.id;
  await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
  await candidate.stream(`/api/interviews/${id}/answers`, { answer: "An answer." }).expect(200);
  return id as string;
}

describe("the admin usage report", () => {
  it("is hidden without the admin token, and off when no (long enough) token is set", async () => {
    const { app } = testApp();
    await usage(app).expect(404); // ADMIN_TOKEN unset

    process.env.ADMIN_TOKEN = "too-short";
    await usage(app, "too-short").expect(404);

    process.env.ADMIN_TOKEN = TOKEN;
    await usage(app, null).expect(404);
    const refused = await usage(app, "b".repeat(32)).expect(404);
    expect(refused.body).toEqual({ code: "NOT_FOUND", message: "Not found" });
    expect(refused.headers["set-cookie"]).toBeUndefined(); // refused before the browser is identified
    await usage(app).expect(200);
  });

  it("shows today's usage per model, candidate and network, against the caps", async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const { app } = testApp();
    const heavy = asCandidate(app);
    await answerOneQuestion(heavy);
    await answerOneQuestion(heavy, "mistral:mistral-small-latest");
    await heavy.post("/api/account/recovery-code").expect(200);
    const light = asCandidate(app);
    await answerOneQuestion(light);

    const { body } = await usage(app).expect(200);
    // The fake AI reports 100 tokens a call: a question and its feedback per interview.
    expect(body.tokens).toEqual({ used: 600, limit: 1_500_000, remaining: 1_499_400 });
    expect(body.interviewsStarted).toBe(3);
    expect(body.models).toEqual(
      expect.arrayContaining([
        { id: "groq:openai/gpt-oss-120b", label: "GPT-OSS 120B", provider: "Groq", used: 400, limit: 190_000, remaining: 189_600 },
        { id: "mistral:mistral-small-latest", label: "Mistral Small", provider: "Mistral", used: 200, limit: null, remaining: null },
      ])
    );
    expect(body.candidates).toEqual([
      { id: heavy.id, tokens: 400, interviews: 2, saved: true },
      { id: light.id, tokens: 200, interviews: 1, saved: false },
    ]);
    // Both browsers share the test's loopback address.
    expect(body.networks).toEqual([{ network: expect.stringMatching(/127\.0\.0\.1|::/), tokens: 600, interviews: 3, searches: 0 }]);
  });

  it("can show yesterday, and no other day", async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    let time = new Date("2026-03-01T12:00:00Z");
    const { app } = testApp({ now: () => time });
    await answerOneQuestion(asCandidate(app));
    time = new Date("2026-03-02T12:00:00Z");

    expect((await usage(app).expect(200)).body.tokens.used).toBe(0);
    expect((await usage(app, TOKEN, "?day=2026-03-01").expect(200)).body.tokens.used).toBe(200);
    await usage(app, TOKEN, "?day=2026-02-27").expect(400);
  });
});

describe("a model's own daily cap", () => {
  it("refuses that model once it's used up, so the candidate can switch", async () => {
    const capped = MODELS.map((model) => (model.id === "groq:openai/gpt-oss-120b" ? { ...model, dailyTokens: 150 } : model));
    const registry = createModelRegistry({ GROQ_API_KEY: "test", MISTRAL_API_KEY: "test" }, capped);
    const { app } = testApp({ registry });
    const candidate = asCandidate(app);
    const id = await answerOneQuestion(candidate); // 200 tokens: the next call is refused

    const res = await candidate.stream(`/api/interviews/${id}/questions`).expect(503);
    expect(JSON.parse(res.body)).toMatchObject({ code: "MODEL_UNAVAILABLE", message: expect.stringMatching(/GPT-OSS 120B has used up today/) });

    await candidate.put(`/api/interviews/${id}/model`, { modelId: "mistral:mistral-small-latest" }).expect(200);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
  });
});

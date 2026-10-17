import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { asCandidate, budget, fakeAi, fakeSearch, setupFixture, testApp, useDatabase } from "./helpers";

useDatabase();

afterEach(() => {
  delete process.env.MAINTENANCE_MODE;
  delete process.env.VERCEL;
});

const humanToken = "valid-token";
const verifyHuman = async (token: string) => token === humanToken;

async function startInterview(candidate: ReturnType<typeof asCandidate>) {
  const res = await candidate.post("/api/interviews", setupFixture()).set("X-Turnstile-Token", humanToken).expect(201);
  return res.body.interview.id as string;
}

describe("bot check", () => {
  it("is required to analyse a resume, start an interview, or practise again", async () => {
    const { app } = testApp({ verifyHuman });
    const candidate = asCandidate(app);

    for (const res of [
      await candidate.post("/api/setup/parse", { resumeText: "r", jobDescription: "j" }),
      await candidate.post("/api/interviews", setupFixture()),
      await candidate.post("/api/interviews", setupFixture()).set("X-Turnstile-Token", "forged"),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("BOT_CHECK_FAILED");
    }

    const id = await startInterview(candidate);
    await candidate.post(`/api/interviews/${id}/retake`).expect(403);
    await candidate.post(`/api/interviews/${id}/retake`).set("X-Turnstile-Token", humanToken).expect(201);
  });

  it("isn't asked again during an interview", async () => {
    const { app } = testApp({ verifyHuman });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "An answer." }).expect(200);
  });
});

describe("AI usage budget", () => {
  it("caps AI calls across everyone, with a capacity message", async () => {
    const { app } = testApp({ budget: budget({ aiCallsGlobal: 2 }) });
    const first = asCandidate(app);
    const id = await startInterview(first);
    await first.stream(`/api/interviews/${id}/questions`).expect(200);
    await first.stream(`/api/interviews/${id}/answers`, { answer: "An answer." }).expect(200);

    const other = asCandidate(app);
    const otherId = await startInterview(other);
    const res = await other.stream(`/api/interviews/${otherId}/questions`).expect(503);
    expect(JSON.parse(res.body)).toMatchObject({ code: "CAPACITY" });
  });

  it("caps each candidate's AI calls per day", async () => {
    const { app } = testApp({ budget: budget({ aiCallsPerCandidate: 2 }) });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "An answer." }).expect(200);

    const res = await candidate.stream(`/api/interviews/${id}/questions`).expect(429);
    expect(JSON.parse(res.body)).toMatchObject({ code: "DAILY_LIMIT" });
    // Another candidate on another IP would be unaffected; here they share an IP, which has its own, higher cap.
  });

  it("limits bursts per minute", async () => {
    const { app } = testApp({ budget: budget({ aiCallsPerMinute: 1 }) });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);

    const res = await candidate.stream(`/api/interviews/${id}/answers`, { answer: "Fast" }).expect(429);
    expect(JSON.parse(res.body)).toMatchObject({ code: "RATE_LIMITED" });
    // Rejected before saving, so the answer can be sent again.
    const saved = await candidate.get(`/api/interviews/${id}`);
    expect(saved.body.interview.turns[0].answer).toBeNull();
  });

  it("doesn't charge for re-showing a question that's already waiting", async () => {
    const { app } = testApp({ budget: budget({ aiCallsPerCandidate: 1 }) });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);

    for (let i = 0; i < 3; i++) await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
  });

  it("caps uncached web searches across everyone", async () => {
    const { app } = testApp({ search: fakeSearch(), budget: budget({ searchesGlobal: 3 }) });
    await asCandidate(app).post("/api/setup/research", { title: "SRE", company: "Initech", seniority: null }).expect(200);

    const res = await asCandidate(app).post("/api/setup/research", { title: "SRE", company: "Hooli", seniority: null }).expect(503);
    expect(res.body.code).toBe("CAPACITY");
    // Cached briefings are still served.
    await asCandidate(app).post("/api/setup/research", { title: "SRE", company: "Initech", seniority: null }).expect(200);
  });
});

describe("the coach chat", () => {
  it("is told to decline requests unrelated to the interview", async () => {
    const ai = fakeAi();
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "An answer." });
    await candidate.stream(`/api/interviews/${id}/coach`, { message: "Write my college essay" }).expect(200);

    expect(ai.calls.at(-1)!.messages[0]!.content).toMatch(/unrelated to preparing for this interview.*decline/);
  });
});

describe("HTTP hardening", () => {
  it("sends no CORS headers, so other sites can't call the API from a browser", async () => {
    const { app } = testApp();
    const res = await request(app).get("/api/models").set("Origin", "https://evil.example").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets security headers and hides the framework", async () => {
    const { app } = testApp();
    const res = await request(app).get("/api/health");
    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "cache-control": "no-store",
    });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("ignores spoofed X-Forwarded-For outside Vercel", async () => {
    const { app } = testApp({ budget: budget({ interviewsPerIp: 1 }) });
    await startInterview(asCandidate(app));
    const spoofed = await asCandidate(app)
      .post("/api/interviews", setupFixture())
      .set("X-Forwarded-For", "203.0.113.9")
      .expect(429);
    expect(spoofed.body.code).toBe("DAILY_LIMIT");
  });

  it("uses Vercel's own client IP header on Vercel", async () => {
    process.env.VERCEL = "1";
    const { app } = testApp({ budget: budget({ interviewsPerIp: 1 }) });
    await asCandidate(app).post("/api/interviews", setupFixture()).set("X-Vercel-Forwarded-For", "198.51.100.1").expect(201);
    await asCandidate(app).post("/api/interviews", setupFixture()).set("X-Vercel-Forwarded-For", "198.51.100.2").expect(201);
    await asCandidate(app).post("/api/interviews", setupFixture()).set("X-Vercel-Forwarded-For", "198.51.100.1").expect(429);
  });
});

describe("maintenance mode", () => {
  it("pauses new setups and interviews but lets interviews in progress finish", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    process.env.MAINTENANCE_MODE = "true";
    const blocked = await candidate.post("/api/interviews", setupFixture()).expect(503);
    expect(blocked.body.code).toBe("MAINTENANCE");
    await candidate.post("/api/setup/parse", { resumeText: "r", jobDescription: "j" }).expect(503);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
  });
});

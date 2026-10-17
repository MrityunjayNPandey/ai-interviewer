import mongoose from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { normalizeReport } from "../src/interview/service";
import {
  asCandidate,
  doneEvent,
  fakeAi,
  parseEvents,
  setupFixture,
  testApp,
  unavailable,
  useDatabase,
} from "./helpers";

useDatabase();

async function startInterview(candidate: ReturnType<typeof asCandidate>, overrides = {}) {
  const res = await candidate.post("/api/interviews", setupFixture(overrides)).expect(201);
  return res.body.interview.id as string;
}

describe("an interview, start to finish", () => {
  it("streams questions and feedback, then writes a report", async () => {
    const { app, ai } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    const asked = await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    const events = parseEvents(asked.body);
    expect(events.filter((event) => event.type === "delta").length).toBeGreaterThan(1);
    const afterQuestion = doneEvent(asked.body);
    expect(afterQuestion.turns).toEqual([
      expect.objectContaining({ index: 0, question: expect.stringContaining("Question 1"), answer: null }),
    ]);

    const answered = await candidate.stream(`/api/interviews/${id}/answers`, { answer: "I built a billing API." }).expect(200);
    expect(doneEvent(answered.body).turns[0]).toMatchObject({
      answer: "I built a billing API.",
      feedback: "Good structure. Add a concrete metric next time.",
    });

    // The next question sees the earlier answer as context.
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    const secondQuestionCall = ai.calls.filter((call) => call.kind === "stream").at(-1)!;
    expect(secondQuestionCall.messages.some((message) => message.content.includes("I built a billing API."))).toBe(true);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "Second answer." }).expect(200);

    // Ending early: the report covers the two answered questions only.
    const ended = await candidate.post(`/api/interviews/${id}/end`).expect(200);
    expect(ended.body.interview).toMatchObject({
      status: "completed",
      report: { overallScore: 7.3, modelId: "groq:openai/gpt-oss-120b" },
    });
    expect(ended.body.interview.report.questions).toHaveLength(2);

    const list = await candidate.get("/api/interviews").expect(200);
    expect(list.body.interviews).toEqual([
      expect.objectContaining({ id, status: "completed", roleTitle: "Senior Backend Engineer", answeredCount: 2, overallScore: 7.3 }),
    ]);
  });

  it("returns the waiting question again after a refresh, without asking the AI", async () => {
    const { app, ai } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    const first = doneEvent((await candidate.stream(`/api/interviews/${id}/questions`)).body);
    const callsBefore = ai.calls.length;
    const again = await candidate.stream(`/api/interviews/${id}/questions`).expect(200);

    expect(parseEvents(again.body)).toEqual([{ type: "done", interview: first }]);
    expect(ai.calls.length).toBe(callsBefore);
  });

  it("stops asking once the chosen number of questions is reached", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate, { length: 3 });

    for (let i = 0; i < 3; i++) {
      await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
      await candidate.stream(`/api/interviews/${id}/answers`, { answer: `Answer ${i}` }).expect(200);
    }
    const res = await candidate.stream(`/api/interviews/${id}/questions`).expect(409);
    expect(JSON.parse(res.body)).toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to end an interview with no answers", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`);

    await candidate.post(`/api/interviews/${id}/end`).expect(409);
  });

  it("rejects an answer when no question is waiting", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "Too early" }).expect(409);
  });

  it("saves only the first of two racing answers", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`);

    const results = await Promise.all([
      candidate.stream(`/api/interviews/${id}/answers`, { answer: "First" }),
      candidate.stream(`/api/interviews/${id}/answers`, { answer: "Second" }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const saved = await candidate.get(`/api/interviews/${id}`);
    expect(["First", "Second"]).toContain(saved.body.interview.turns[0].answer);
  });

  it("only generates one question when two requests race", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const ai = fakeAi({
      stream: async () => {
        await gate;
        return "What is your proudest project?";
      },
    });
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    const first = candidate.stream(`/api/interviews/${id}/questions`).then((res) => res);
    // Wait until the first request has reserved the slot.
    await expect.poll(() => ai.calls.length).toBe(1);
    const second = await candidate.stream(`/api/interviews/${id}/questions`);
    release();

    expect(second.status).toBe(409);
    expect(doneEvent((await first).body).turns).toHaveLength(1);
  });
});

describe("mock mode", () => {
  it("hides feedback until the interview ends", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate, { mode: "mock" });

    await candidate.stream(`/api/interviews/${id}/questions`);
    const answered = await candidate.stream(`/api/interviews/${id}/answers`, { answer: "My answer." }).expect(200);
    expect(parseEvents(answered.body).map((event) => event.type)).toEqual(["done"]);
    expect(doneEvent(answered.body).turns[0]!.feedback).toBeNull();

    const ended = await candidate.post(`/api/interviews/${id}/end`).expect(200);
    expect(ended.body.interview.turns[0].feedback).toBe("Good structure. Add a concrete metric next time.");
  });

  it("keeps going when feedback fails", async () => {
    const ai = fakeAi({
      stream: (_model, messages) =>
        messages.at(-1)!.content.includes("Give me feedback") ? unavailable() : "A question?",
    });
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate, { mode: "mock" });

    await candidate.stream(`/api/interviews/${id}/questions`);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "My answer." }).expect(200);
    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
  });
});

describe("when a model fails", () => {
  it("returns MODEL_UNAVAILABLE, frees the slot, and works again after switching models", async () => {
    const ai = fakeAi({
      stream: (model) => (model.startsWith("groq:") ? unavailable(model) : "A question from Mistral?"),
    });
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    const failed = await candidate.stream(`/api/interviews/${id}/questions`).expect(503);
    expect(JSON.parse(failed.body)).toMatchObject({ code: "MODEL_UNAVAILABLE" });

    await candidate.put(`/api/interviews/${id}/model`, { modelId: "mistral:mistral-small-latest" }).expect(200);
    const asked = doneEvent((await candidate.stream(`/api/interviews/${id}/questions`).expect(200)).body);

    expect(asked.turns).toEqual([
      expect.objectContaining({ question: "A question from Mistral?", modelId: "mistral:mistral-small-latest" }),
    ]);
  });

  it("keeps the answer when coach feedback fails, so feedback can be retried", async () => {
    let feedbackFails = true;
    const ai = fakeAi({
      stream: (model, messages) => {
        if (!messages.at(-1)!.content.includes("Give me feedback")) return "A question?";
        return feedbackFails ? unavailable(model) : "Nice answer.";
      },
    });
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);
    await candidate.stream(`/api/interviews/${id}/questions`);

    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "My answer." }).expect(503);
    const saved = await candidate.get(`/api/interviews/${id}`).expect(200);
    expect(saved.body.interview.turns[0]).toMatchObject({ answer: "My answer.", feedback: null });

    feedbackFails = false;
    const retried = await candidate.stream(`/api/interviews/${id}/feedback`).expect(200);
    expect(doneEvent(retried.body).turns[0]!.feedback).toBe("Nice answer.");
  });

  it("sends an error event when the model fails mid-stream", async () => {
    const ai = fakeAi();
    ai.stream = async function* () {
      yield "Partial ";
      throw unavailable();
    };
    const { app } = testApp({ ai });
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    const res = await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    expect(parseEvents(res.body)).toEqual([
      { type: "delta", text: "Partial " },
      expect.objectContaining({ type: "error", code: "MODEL_UNAVAILABLE" }),
    ]);
    // The slot was released, so the candidate can simply retry.
    const saved = await candidate.get(`/api/interviews/${id}`).expect(200);
    expect(saved.body.interview.turns).toEqual([]);
  });
});

describe("coach mode: retries and coach chat", () => {
  async function answeredInterview(app: Parameters<typeof asCandidate>[0], overrides = {}) {
    const candidate = asCandidate(app);
    const id = await startInterview(candidate, overrides);
    await candidate.stream(`/api/interviews/${id}/questions`);
    await candidate.stream(`/api/interviews/${id}/answers`, { answer: "First try." }).expect(200);
    return { candidate, id };
  }

  it("lets the candidate answer a question again, keeping earlier attempts", async () => {
    const { app, ai } = testApp();
    const { candidate, id } = await answeredInterview(app);

    const reopened = await candidate.post(`/api/interviews/${id}/retry`).expect(200);
    expect(reopened.body.interview.turns[0]).toMatchObject({
      answer: null,
      feedback: null,
      previousAttempts: [{ answer: "First try.", feedback: "Good structure. Add a concrete metric next time." }],
    });

    const answered = await candidate.stream(`/api/interviews/${id}/answers`, { answer: "Better try." }).expect(200);
    expect(doneEvent(answered.body).turns[0]).toMatchObject({ answer: "Better try.", feedback: expect.any(String) });
    // The feedback compares against the earlier attempt.
    const feedbackCall = ai.calls.at(-1)!;
    expect(feedbackCall.messages[0]!.content).toContain("attempt 2");
    expect(feedbackCall.messages.some((message) => message.content === "First try.")).toBe(true);
  });

  it("allows two retries per question", async () => {
    const { app } = testApp();
    const { candidate, id } = await answeredInterview(app);
    for (const answer of ["Second.", "Third."]) {
      await candidate.post(`/api/interviews/${id}/retry`).expect(200);
      await candidate.stream(`/api/interviews/${id}/answers`, { answer }).expect(200);
    }
    await candidate.post(`/api/interviews/${id}/retry`).expect(409);
  });

  it("sends every attempt to the report, and falls back to the last attempt if a retry was never answered", async () => {
    const { app, ai } = testApp();
    const { candidate, id } = await answeredInterview(app);
    await candidate.post(`/api/interviews/${id}/retry`).expect(200);

    const ended = await candidate.post(`/api/interviews/${id}/end`).expect(200);
    expect(ended.body.interview.turns[0]).toMatchObject({ answer: "First try.", previousAttempts: [] });
    expect(ended.body.interview.report.questions).toHaveLength(1);
    expect(ai.calls.at(-1)!.kind).toBe("json");
  });

  it("answers questions about the feedback, without showing them to the interviewer", async () => {
    const { app, ai } = testApp();
    const { candidate, id } = await answeredInterview(app);

    const chatted = await candidate.stream(`/api/interviews/${id}/coach`, { message: "What metric would you add?" }).expect(200);
    expect(doneEvent(chatted.body).turns[0]!.coachMessages).toEqual([
      { role: "candidate", content: "What metric would you add?", attempt: 0 },
      { role: "coach", content: expect.stringContaining("What metric would you add?"), attempt: 0 },
    ]);
    const coachCall = ai.calls.at(-1)!;
    expect(coachCall.messages[0]!.content).toContain("First try.");
    expect(coachCall.messages[0]!.content).toContain("Good structure.");

    await candidate.stream(`/api/interviews/${id}/questions`).expect(200);
    const questionCall = ai.calls.at(-1)!;
    expect(JSON.stringify(questionCall.messages)).not.toContain("What metric would you add?");
  });

  it("limits the coach chat to 5 questions per interview question", async () => {
    const { app } = testApp();
    const { candidate, id } = await answeredInterview(app);
    for (let i = 0; i < 5; i++) {
      await candidate.stream(`/api/interviews/${id}/coach`, { message: `Question ${i}` }).expect(200);
    }
    await candidate.stream(`/api/interviews/${id}/coach`, { message: "One more" }).expect(409);
  });

  it("doesn't count a coach message whose reply failed", async () => {
    let fail = true;
    const ai = fakeAi({
      stream: (model, messages) => {
        if (messages[0]!.content.includes("questions about your feedback")) return fail ? unavailable(model) : "Coach reply";
        return messages.at(-1)!.content.includes("Give me feedback") ? "Feedback." : "A question?";
      },
    });
    const { app } = testApp({ ai });
    const { candidate, id } = await answeredInterview(app);

    await candidate.stream(`/api/interviews/${id}/coach`, { message: "Why?" }).expect(503);
    fail = false;
    const retried = await candidate.stream(`/api/interviews/${id}/coach`, { message: "Why?" }).expect(200);
    expect(doneEvent(retried.body).turns[0]!.coachMessages).toHaveLength(2);
  });

  it("works on interviews saved before retries and coach chat existed", async () => {
    const { app } = testApp();
    const { candidate, id } = await answeredInterview(app);
    await mongoose.connection
      .collection("practice_interviews")
      .updateOne({}, { $unset: { "turns.0.coachMessages": "", "turns.0.previousAttempts": "" } });

    await candidate.stream(`/api/interviews/${id}/coach`, { message: "Why?" }).expect(200);
    await candidate.post(`/api/interviews/${id}/retry`).expect(200);
  });

  it("is not available in mock mode", async () => {
    const { app } = testApp();
    const { candidate, id } = await answeredInterview(app, { mode: "mock" });

    await candidate.post(`/api/interviews/${id}/retry`).expect(409);
    await candidate.stream(`/api/interviews/${id}/coach`, { message: "Why?" }).expect(409);
  });
});

describe("candidates", () => {
  it("can only see their own interviews", async () => {
    const { app } = testApp();
    const owner = asCandidate(app);
    const stranger = asCandidate(app);
    const id = await startInterview(owner);

    await stranger.get(`/api/interviews/${id}`).expect(404);
    await stranger.delete(`/api/interviews/${id}`).expect(404);
    expect((await stranger.get("/api/interviews")).body.interviews).toEqual([]);
  });

  it("must identify themselves", async () => {
    const { app } = testApp();
    await request(app).get("/api/interviews").expect(400);
    await request(app).get("/api/interviews").set("X-Candidate-Id", "not-a-uuid").expect(400);
  });

  it("can delete an interview", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate);

    await candidate.delete(`/api/interviews/${id}`).expect(204);
    await candidate.get(`/api/interviews/${id}`).expect(404);
  });

  it("can practise again with the same setup", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    const id = await startInterview(candidate, { length: 4 });

    const res = await candidate.post(`/api/interviews/${id}/retake`).expect(201);
    expect(res.body.interview).toMatchObject({ status: "in_progress", turns: [], setup: { length: 4 } });
    expect(res.body.interview.id).not.toBe(id);
  });
});

describe("daily limits", () => {
  it("allows 5 new interviews a day per candidate", async () => {
    const { app } = testApp();
    const candidate = asCandidate(app);
    for (let i = 0; i < 5; i++) await startInterview(candidate);

    const res = await candidate.post("/api/interviews", setupFixture()).expect(429);
    expect(res.body).toMatchObject({ code: "DAILY_LIMIT" });
  });

  it("also limits by IP, across candidates", async () => {
    const { app } = testApp({ limits: { interviews: 2, parses: 30 } });
    await startInterview(asCandidate(app));
    await startInterview(asCandidate(app));

    await asCandidate(app).post("/api/interviews", setupFixture()).expect(429);
  });
});

describe("setup validation", () => {
  it("rejects models that aren't available", async () => {
    const { app } = testApp();
    const res = await asCandidate(app).post("/api/interviews", setupFixture({ modelId: "groq:retired-model" })).expect(400);
    expect(res.body.message).toMatch(/model/);
  });

  it("rejects out-of-range lengths", async () => {
    const { app } = testApp();
    await asCandidate(app).post("/api/interviews", setupFixture({ length: 50 })).expect(400);
  });
});

describe("normalizeReport", () => {
  it("keeps one entry per answered question, in order, with tidy scores", () => {
    const report = normalizeReport(
      {
        overallScore: 11,
        summary: "s",
        strengths: ["a"],
        improvements: [{ area: "x", suggestion: "y" }],
        questions: [
          { index: 1, score: 6.66, note: "second", strongAnswer: "" },
          { index: 0, score: -1, note: "first", strongAnswer: "" },
          { index: 7, score: 5, note: "bogus", strongAnswer: "" },
        ],
      },
      3
    );
    expect(report.overallScore).toBe(10);
    expect(report.questions.map((q) => [q.index, q.note, q.score])).toEqual([
      [0, "first", 0],
      [1, "second", 6.7],
      [2, "No assessment was produced for this answer.", 0],
    ]);
  });
});

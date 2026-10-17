import { describe, expect, it } from "vitest";
import { canonicalUrl } from "../src/research/briefing";
import { asCandidate, budget, doneEvent, fakeSearch, setupFixture, testApp, useDatabase } from "./helpers";

useDatabase();

const subject = { title: "Senior Backend Engineer", company: "Globex", seniority: "Senior" };

describe("POST /api/setup/research", () => {
  it("builds a briefing whose every point links to a real search result", async () => {
    const search = fakeSearch();
    const { app, ai } = testApp({ search });
    const res = await asCandidate(app).post("/api/setup/research", subject).expect(200);

    expect(search.queries).toEqual([
      "Globex Senior Backend Engineer interview questions",
      "Globex Senior Backend Engineer interview process rounds",
      "Globex engineering culture values tech stack",
    ]);
    const { briefing } = res.body;
    expect(briefing.scope).toBe("company");
    // The question citing a non-existent source is dropped.
    expect(briefing.questions).toEqual([{ text: "Design an idempotent payments API.", sourceIds: [1, 2] }]);
    expect(briefing.sources).toEqual([
      { id: 1, title: "Globex careers", url: "https://example.com/globex" },
      { id: 2, title: "Interview experiences", url: "https://example.com/interviews" },
    ]);
    // Web content goes to the model fenced as untrusted data.
    const prompt = ai.calls[0]!.messages;
    expect(prompt[0]!.content).toMatch(/untrusted web content/);
    expect(prompt[1]!.content).toContain('<source id="1"');
  });

  it("serves repeat requests from the cache, for any candidate, without counting against the limit", async () => {
    const search = fakeSearch();
    const { app, ai } = testApp({ search, budget: budget({ aiCallsPerCandidate: 1, searchesGlobal: 3 }) });
    await asCandidate(app).post("/api/setup/research", subject).expect(200);
    const again = await asCandidate(app).post("/api/setup/research", { ...subject, title: " senior backend ENGINEER " }).expect(200);

    expect(again.body.cached).toBe(true);
    expect(search.queries).toHaveLength(3);
    expect(ai.calls).toHaveLength(1);
  });

  it("searches for the level at a company, such as Google L3", async () => {
    const search = fakeSearch();
    const { app } = testApp({ search });
    await asCandidate(app).post("/api/setup/research", { title: "Software Engineer", company: "Google", seniority: "L3" }).expect(200);

    expect(search.queries).toEqual([
      "Google Software Engineer L3 interview questions",
      "Google Software Engineer L3 interview process rounds",
      "Google engineering culture values tech stack",
    ]);
  });

  it("leaves the level out when there is none", async () => {
    const search = fakeSearch();
    const { app } = testApp({ search });
    await asCandidate(app).post("/api/setup/research", { title: "Software Engineer", company: "Google", seniority: null }).expect(200);

    expect(search.queries[0]).toBe("Google Software Engineer interview questions");
  });

  it("researches the role in general when there is no company", async () => {
    const search = fakeSearch();
    const { app } = testApp({ search });
    const res = await asCandidate(app).post("/api/setup/research", { title: "Data Analyst", company: "", seniority: "Junior" }).expect(200);

    expect(search.queries).toEqual(["Junior Data Analyst interview questions", "Junior Data Analyst interview topics to prepare"]);
    expect(res.body.briefing).toMatchObject({ scope: "role", about: [] });
  });

  it("re-searches when asked to refresh", async () => {
    const search = fakeSearch();
    const { app } = testApp({ search });
    const candidate = asCandidate(app);
    await candidate.post("/api/setup/research", subject).expect(200);
    const refreshed = await candidate.post("/api/setup/research", { ...subject, refresh: true }).expect(200);

    expect(refreshed.body.cached).toBe(false);
    expect(search.queries).toHaveLength(6);
  });

  it("explains when research isn't configured", async () => {
    const { app } = testApp({ search: null });
    const res = await asCandidate(app).post("/api/setup/research", subject).expect(503);
    expect(res.body.code).toBe("RESEARCH_UNAVAILABLE");
  });

  it("returns an empty briefing when the web has nothing", async () => {
    const { app, ai } = testApp({ search: fakeSearch(() => []) });
    const res = await asCandidate(app).post("/api/setup/research", subject).expect(200);

    expect(res.body.briefing).toMatchObject({ questions: [], sources: [] });
    expect(ai.calls).toHaveLength(0);
  });
});

describe("the interviewer and the briefing", () => {
  it("asks about a third of the questions from the briefing, without its links", async () => {
    const { app, ai } = testApp({ search: fakeSearch() });
    const candidate = asCandidate(app);
    const { briefing } = (await candidate.post("/api/setup/research", subject)).body;
    const created = await candidate.post("/api/interviews", setupFixture({ briefing })).expect(201);
    doneEvent((await candidate.stream(`/api/interviews/${created.body.interview.id}/questions`)).body);

    const system = ai.calls.at(-1)!.messages[0]!.content;
    expect(system).toContain("About a third of your questions");
    expect(system).toContain("Design an idempotent payments API.");
    expect(system).not.toContain("https://example.com");
  });

  it("leaves the instruction out when there is no briefing", async () => {
    const { app, ai } = testApp();
    const candidate = asCandidate(app);
    const created = await candidate.post("/api/interviews", setupFixture()).expect(201);
    await candidate.stream(`/api/interviews/${created.body.interview.id}/questions`);

    expect(ai.calls.at(-1)!.messages[0]!.content).not.toContain("About a third");
  });
});

describe("canonicalUrl", () => {
  it("treats the same page with tracking parameters as one source", () => {
    expect(canonicalUrl("https://www.youtube.com/watch?v=YojGTqNM6m8&xstg=CAMSBhUD")).toBe(canonicalUrl("https://youtube.com/watch?v=YojGTqNM6m8"));
    expect(canonicalUrl("https://example.com/post/?utm_source=x#comments")).toBe("https://example.com/post");
  });

  it("keeps parameters that identify the page", () => {
    expect(canonicalUrl("https://example.com/item?id=42")).toBe("https://example.com/item?id=42");
  });
});

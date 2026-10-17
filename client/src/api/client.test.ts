import { describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, streamResponse } from "../test/render";
import { api, ApiError } from "./client";

const done = { type: "done", interview: { id: "abc" } };

describe("api.stream", () => {
  it("delivers text deltas in order, even when lines are split across chunks", async () => {
    mockFetch(() =>
      streamResponse([
        '{"type":"delta","text":"Hel',
        'lo "}\n{"type":"delta","text":"world"}\n',
        `${JSON.stringify(done)}\n`,
      ])
    );
    const deltas: string[] = [];
    const interview = await api.stream("/interviews/abc/questions", {}, (text) => deltas.push(text));

    expect(deltas).toEqual(["Hello ", "world"]);
    expect(interview).toEqual({ id: "abc" });
  });

  it("turns an error event into an ApiError with its code", async () => {
    mockFetch(() =>
      streamResponse(['{"type":"delta","text":"Par"}\n', '{"type":"error","code":"MODEL_UNAVAILABLE","message":"Busy"}\n'])
    );
    const error = await api.stream("/x", {}, () => {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE", message: "Busy" });
  });

  it("reports a stream that ends without a result", async () => {
    mockFetch(() => streamResponse(['{"type":"delta","text":"Par"}\n']));
    await expect(api.stream("/x", {}, () => {})).rejects.toThrow(/closed early/);
  });
});

describe("requests", () => {
  it("send the id an older version kept in localStorage until the server has it, then forget it", async () => {
    const legacyId = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
    localStorage.setItem("ai-interviewer.candidateId", legacyId);
    vi.resetModules(); // the stored id is read when the module loads
    const { api: fresh } = await import("./client");
    let fail = true;
    const fetch = mockFetch(() => (fail ? jsonResponse({ code: "INTERNAL", message: "Down" }, 500) : jsonResponse({ interviews: [] })));

    await expect(fresh.get("/interviews")).rejects.toThrow("Down");
    fail = false;
    await fresh.get("/interviews");
    await fresh.get("/interviews");

    const sent = fetch.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["X-Candidate-Id"]);
    expect(sent).toEqual([legacyId, legacyId, undefined]);
    expect(localStorage.getItem("ai-interviewer.candidateId")).toBeNull();
  });

  it("send no id of their own: the server's cookie identifies the browser", async () => {
    const fetch = mockFetch(() => jsonResponse({ interviews: [] }));
    await api.get("/interviews");
    expect((fetch.mock.calls[0]![1]?.headers as Record<string, string>)["X-Candidate-Id"]).toBeUndefined();
  });

  it("surface the server's error code and message", async () => {
    mockFetch(() => jsonResponse({ code: "DAILY_LIMIT", message: "Come back tomorrow" }, 429));
    await expect(api.post("/interviews", {})).rejects.toMatchObject({ status: 429, code: "DAILY_LIMIT", message: "Come back tomorrow" });
  });

  it("explain when the server can't be reached", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(api.get("/models")).rejects.toThrow(/Couldn't reach the server/);
  });
});

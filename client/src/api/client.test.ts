import { describe, expect, it } from "vitest";
import { jsonResponse, mockFetch, streamResponse } from "../test/render";
import { api, ApiError, getCandidateId } from "./client";

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
  it("send the same anonymous candidate id every time", async () => {
    const fetch = mockFetch(() => jsonResponse({ interviews: [] }));
    await api.get("/interviews");
    await api.get("/interviews");

    const ids = fetch.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["X-Candidate-Id"]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(getCandidateId()).toBe(ids[0]);
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

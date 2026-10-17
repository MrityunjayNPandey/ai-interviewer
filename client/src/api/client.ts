import type { ApiErrorBody, ApiErrorCode, InterviewView, StreamEvent } from "./types";

// The server identifies this browser with an HttpOnly cookie. Browsers from before that kept the id
// in localStorage: it is sent until the server has answered (and set the cookie), then forgotten.
const LEGACY_CANDIDATE_KEY = "ai-interviewer.candidateId";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null; // blocked, e.g. in some private modes
  }
}

let legacyCandidateId: string | null = storage()?.getItem(LEGACY_CANDIDATE_KEY) ?? null;

function forgetLegacyCandidateId() {
  legacyCandidateId = null;
  storage()?.removeItem(LEGACY_CANDIDATE_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  return new ApiError(
    response.status,
    body?.code ?? "INTERNAL",
    body?.message ?? `The server responded with ${response.status}. Please try again.`
  );
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { ...(legacyCandidateId ? { "X-Candidate-Id": legacyCandidateId } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "INTERNAL", "Couldn't reach the server. Check your connection and try again.");
  }
  if (legacyCandidateId && response.ok) forgetLegacyCandidateId(); // the server now has it as a cookie
  if (!response.ok) throw await errorFrom(response);
  return response;
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const api = {
  async get<T>(path: string): Promise<T> {
    return (await send(path)).json() as Promise<T>;
  },
  async post<T>(path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<T> {
    const response = await send(path, json(body, headers));
    return (response.status === 204 ? undefined : response.json()) as Promise<T>;
  },
  async put<T>(path: string, body: unknown): Promise<T> {
    return (await send(path, { ...json(body), method: "PUT" })).json() as Promise<T>;
  },
  async delete(path: string): Promise<void> {
    await send(path, { method: "DELETE" });
  },
  async upload<T>(path: string, file: File, headers: Record<string, string> = {}): Promise<T> {
    return (await send(path, { method: "POST", headers: { "Content-Type": file.type, ...headers }, body: file })).json() as Promise<T>;
  },

  /** POSTs to a streaming endpoint, calling `onDelta` with each text chunk; resolves with the updated interview. */
  async stream(path: string, body: unknown, onDelta: (text: string) => void): Promise<InterviewView> {
    const response = await send(path, json(body));
    if (!response.body) throw new ApiError(0, "INTERNAL", "Streaming isn't supported in this browser.");

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += value;
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "delta") onDelta(event.text);
        else if (event.type === "done") return event.interview;
        else throw new ApiError(response.status, event.code, event.message);
      }
      if (done) break;
    }
    throw new ApiError(0, "INTERNAL", "The connection closed early. Please try again.");
  },
};

import type { FastifyRequest } from "fastify";
import { HttpError } from "./errors";

// Candidates are anonymous: the browser generates a random UUID once and sends it on every request.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CANDIDATE_HEADER = "x-candidate-id";

const candidates = new WeakMap<FastifyRequest, string>();

export const header = (request: FastifyRequest, name: string) => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/** preHandler hook: rejects requests without a valid candidate id. */
export async function requireCandidate(request: FastifyRequest) {
  const id = header(request, CANDIDATE_HEADER);
  if (!id || !UUID.test(id)) {
    throw new HttpError(400, "INVALID_REQUEST", `Missing or invalid ${CANDIDATE_HEADER} header`);
  }
  candidates.set(request, id.toLowerCase());
}

export function candidateId(request: FastifyRequest): string {
  const id = candidates.get(request);
  if (!id) throw new Error("requireCandidate hook is missing");
  return id;
}

/**
 * The client's IP. On Vercel, x-vercel-forwarded-for is set by Vercel itself and can't be spoofed;
 * elsewhere (local dev) we use the socket address and ignore client-supplied forwarding headers.
 */
export function clientIp(request: FastifyRequest): string {
  if (process.env.VERCEL) {
    const forwarded = header(request, "x-vercel-forwarded-for") ?? header(request, "x-real-ip");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.raw.socket.remoteAddress ?? "unknown";
}


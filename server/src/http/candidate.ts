import type { Request, RequestHandler } from "express";
import { HttpError } from "./errors";

// Candidates are anonymous: the browser generates a random UUID once and sends it on every request.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CANDIDATE_HEADER = "x-candidate-id";

const candidates = new WeakMap<Request, string>();

export const requireCandidate: RequestHandler = (req, _res, next) => {
  const id = req.get(CANDIDATE_HEADER);
  if (!id || !UUID.test(id)) {
    throw new HttpError(400, "INVALID_REQUEST", `Missing or invalid ${CANDIDATE_HEADER} header`);
  }
  candidates.set(req, id.toLowerCase());
  next();
};

export function candidateId(req: Request): string {
  const id = candidates.get(req);
  if (!id) throw new Error("requireCandidate middleware is missing");
  return id;
}

/**
 * The client's IP. On Vercel, x-vercel-forwarded-for is set by Vercel itself and can't be spoofed;
 * elsewhere (local dev) we use the socket address and ignore client-supplied forwarding headers.
 */
export function clientIp(req: Request): string {
  if (process.env.VERCEL) {
    const forwarded = req.get("x-vercel-forwarded-for") ?? req.get("x-real-ip");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

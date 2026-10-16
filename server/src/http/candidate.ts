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

/** Keys a request is rate-limited by: the candidate and their IP. */
export function usageKeys(req: Request): string[] {
  return [`candidate:${candidateId(req)}`, `ip:${req.ip ?? "unknown"}`];
}

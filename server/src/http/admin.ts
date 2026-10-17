import type { FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { header } from "./candidate";
import { HttpError } from "./errors";

/** Shorter tokens are refused, so a weak ADMIN_TOKEN can't be guessed. */
export const MIN_ADMIN_TOKEN_LENGTH = 32;

const digest = (value: string) => createHash("sha256").update(value).digest();

let warned = false;

/**
 * onRequest hook for admin routes: requires `Authorization: Bearer <ADMIN_TOKEN>`.
 * Without a (long enough) ADMIN_TOKEN the routes are off. Every refusal is a plain 404, so the
 * routes don't reveal that they exist.
 */
export function requireAdmin(env: NodeJS.ProcessEnv = process.env) {
  return async (request: FastifyRequest) => {
    const expected = env.ADMIN_TOKEN ?? "";
    if (expected && expected.length < MIN_ADMIN_TOKEN_LENGTH && !warned) {
      warned = true;
      console.warn(`ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN_LENGTH} characters: the admin pages are disabled.`);
    }
    const given = /^Bearer (.+)$/.exec(header(request, "authorization") ?? "")?.[1] ?? "";
    // Comparing digests keeps the comparison constant-time whatever the lengths.
    if (expected.length < MIN_ADMIN_TOKEN_LENGTH || !timingSafeEqual(digest(given), digest(expected))) {
      throw new HttpError(404, "NOT_FOUND", "Not found");
    }
  };
}

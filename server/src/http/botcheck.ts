import type { FastifyRequest } from "fastify";
import { clientIp, header } from "./candidate";
import { HttpError } from "./errors";

export const BOT_CHECK_HEADER = "x-turnstile-token";

/** Verifies a Cloudflare Turnstile token; resolves false for a bad, expired or reused token. */
export type VerifyHuman = (token: string, ip: string) => Promise<boolean>;

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Null when TURNSTILE_SECRET_KEY isn't set (local development): the check is skipped. */
export function createTurnstileVerifier(env: NodeJS.ProcessEnv = process.env): VerifyHuman | null {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (env.VERCEL) console.warn("TURNSTILE_SECRET_KEY is not set: bot checks are disabled.");
    return null;
  }
  return async (token, ip) => {
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json()) as { success?: boolean };
      return body.success === true;
    } catch {
      // Fail closed: if Cloudflare can't be reached, don't let unverified traffic through.
      return false;
    }
  };
}

/** preHandler hook requiring a valid, single-use bot-check token on the expensive entry points (starting work). */
export function requireHuman(verify: VerifyHuman | null) {
  return async (request: FastifyRequest) => {
    if (!verify) return;
    const token = header(request, BOT_CHECK_HEADER);
    if (!token || token.length > 2048 || !(await verify(token, clientIp(request)))) {
      throw new HttpError(403, "BOT_CHECK_FAILED", "We couldn't verify you're human. Please try again.");
    }
  };
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "./errors";

/** Conservative headers for JSON API responses (the site's own headers are set in vercel.json). */
export const API_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
};

/** onRequest hook. Streaming replies bypass Fastify's reply headers, so ndjson.ts sends these itself. */
export async function apiSecurityHeaders(_request: FastifyRequest, reply: FastifyReply) {
  reply.headers(API_SECURITY_HEADERS);
}

/** MAINTENANCE_MODE=true pauses new work (setup and new interviews); interviews in progress continue. */
export function pauseNewWork(env: NodeJS.ProcessEnv = process.env) {
  return async () => {
    if (env.MAINTENANCE_MODE === "true") {
      throw new HttpError(503, "MAINTENANCE", "New interviews are paused for maintenance. Please check back soon.");
    }
  };
}

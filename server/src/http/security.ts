import type { RequestHandler } from "express";
import { HttpError } from "./errors";

/** Conservative headers for JSON API responses (the site's own headers are set in vercel.json). */
export const apiSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  next();
};

/** MAINTENANCE_MODE=true pauses new work (setup and new interviews); interviews in progress continue. */
export function pauseNewWork(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  return (_req, _res, next) => {
    if (env.MAINTENANCE_MODE === "true") {
      throw new HttpError(503, "MAINTENANCE", "New interviews are paused for maintenance. Please check back soon.");
    }
    next();
  };
}

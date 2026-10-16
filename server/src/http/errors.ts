import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AiUnavailableError } from "../ai/client";
import type { ApiError, ApiErrorCode } from "../interview/schemas";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "NOT_FOUND", "Interview not found");
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

/** Maps any thrown error to the status and body the API returns. */
export function toApiError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { code: error.code, message: error.message } };
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return {
      status: 400,
      body: { code: "INVALID_REQUEST", message: `${issue?.message ?? "Invalid request"}${where}` },
    };
  }
  if (error instanceof AiUnavailableError) {
    return { status: 503, body: { code: "MODEL_UNAVAILABLE", message: error.message } };
  }
  console.error(error);
  return { status: 500, body: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // Body-parser errors (malformed JSON, payload too large) carry their own status.
  if (typeof error?.status === "number" && error.status < 500 && error.type) {
    res.status(error.status).json({ code: "INVALID_REQUEST", message: error.message });
    return;
  }
  const { status, body } = toApiError(error);
  res.status(status).json(body);
};

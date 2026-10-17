import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AiUnavailableError } from "../ai/client";
import type { ApiError, ApiErrorCode } from "../interview/schemas";
import { SearchUnavailableError } from "../research/search";

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
  if (error instanceof SearchUnavailableError) {
    return { status: 503, body: { code: "RESEARCH_UNAVAILABLE", message: `${error.message}. Try again later.` } };
  }
  console.error(error);
  return { status: 500, body: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
}

/** Fastify's own request errors (malformed JSON, body too large, unsupported content type). */
const isFastifyClientError = (error: unknown): error is FastifyError =>
  typeof error === "object" &&
  error !== null &&
  typeof (error as FastifyError).code === "string" &&
  (error as FastifyError).code.startsWith("FST_") &&
  typeof (error as FastifyError).statusCode === "number" &&
  (error as FastifyError).statusCode! < 500;

export function errorHandler(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  if (isFastifyClientError(error)) {
    return reply.code(error.statusCode!).send({ code: "INVALID_REQUEST", message: error.message } satisfies ApiError);
  }
  const { status, body } = toApiError(error);
  return reply.code(status).send(body);
}

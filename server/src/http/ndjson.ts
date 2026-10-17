import type { FastifyReply } from "fastify";
import type { InterviewView, StreamEvent } from "../interview/schemas";
import { toApiError } from "./errors";
import { API_SECURITY_HEADERS } from "./security";

/**
 * Runs `work` and streams its text deltas as newline-delimited JSON, ending with a `done` event.
 * The stream starts lazily on the first event, so errors raised before any output still get a
 * normal JSON error response with the right status code.
 */
export async function streamNdjson(
  reply: FastifyReply,
  work: (onDelta: (text: string) => void) => Promise<InterviewView>
): Promise<void> {
  const raw = reply.raw;
  let started = false;
  const send = (event: StreamEvent) => {
    if (!started) {
      started = true;
      // Take the response over from Fastify; from here on we write to the socket directly.
      reply.hijack();
      const cookie = reply.getHeader("set-cookie"); // e.g. a new browser's candidate cookie
      raw.writeHead(200, {
        ...(cookie === undefined ? {} : { "Set-Cookie": cookie as string | string[] }),
        ...API_SECURITY_HEADERS,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      });
    }
    // Keep working if the candidate disconnects, so the result is saved for when they come back.
    if (!raw.destroyed) raw.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const interview = await work((text) => send({ type: "delta", text }));
    send({ type: "done", interview });
    raw.end();
  } catch (error) {
    if (!started) throw error;
    const { body } = toApiError(error);
    send({ type: "error", ...body });
    raw.end();
  }
}

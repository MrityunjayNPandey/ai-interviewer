import type { Response } from "express";
import type { InterviewView, StreamEvent } from "../interview/schemas";
import { toApiError } from "./errors";

/**
 * Runs `work` and streams its text deltas as newline-delimited JSON, ending with a `done` event.
 * The stream starts lazily on the first event, so errors raised before any output still get a
 * normal JSON error response with the right status code.
 */
export async function streamNdjson(
  res: Response,
  work: (onDelta: (text: string) => void) => Promise<InterviewView>
): Promise<void> {
  const send = (event: StreamEvent) => {
    if (!res.headersSent) {
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
    }
    // Keep working if the candidate disconnects, so the result is saved for when they come back.
    if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const interview = await work((text) => send({ type: "delta", text }));
    send({ type: "done", interview });
    res.end();
  } catch (error) {
    if (!res.headersSent) throw error;
    const { body } = toApiError(error);
    send({ type: "error", ...body });
    res.end();
  }
}

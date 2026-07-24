import type { InterviewEvent } from "@specpasa/providers/node";
import { registerSession, releaseSession, type RegisteredSession } from "./interview-sessions";

/**
 * Server half of an interview/conversion stream: registers the session, pipes
 * its events as ndjson, keeps idle connections alive with pings (interviews
 * sit quiet for minutes while the user thinks), and releases the session when
 * the stream ends. A client disconnect cancels the session.
 */

/** Events the interview/convert routes stream to the panel. */
export type SessionStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "ping" }
  | InterviewEvent
  | { type: "done"; [key: string]: unknown };

const PING_INTERVAL_MS = 25_000;
const DOC_PERSIST_THROTTLE_MS = 2_000;

export interface SessionStreamHooks {
  /** Persist an intermediate document state (throttled). */
  onDocUpdate?: (markdown: string) => Promise<void>;
  /**
   * Runs when the session completes; the returned fields are merged into the
   * `done` event sent to the client. Throwing turns `done` into `error`.
   */
  onDone?: (markdown: string) => Promise<Record<string, unknown> | void>;
}

export function sessionResponse(entry: RegisteredSession, hooks: SessionStreamHooks): Response {
  const { session } = entry;
  registerSession(entry);

  const encoder = new TextEncoder();
  let ping: NodeJS.Timeout | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: SessionStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
      ping = setInterval(() => {
        try {
          send({ type: "ping" });
        } catch {
          // Stream already closed; the finally below cleans up.
        }
      }, PING_INTERVAL_MS);

      let lastPersist = 0;
      const dispatch = async (event: InterviewEvent) => {
        if (event.type === "doc-update" && hooks.onDocUpdate) {
          const now = Date.now();
          if (now - lastPersist >= DOC_PERSIST_THROTTLE_MS) {
            lastPersist = now;
            await hooks.onDocUpdate(event.markdown).catch(() => {});
          }
          send(event);
        } else if (event.type === "done") {
          const extra = hooks.onDone ? await hooks.onDone(event.markdown) : undefined;
          send({ ...event, ...(extra ?? {}) });
        } else {
          send(event);
        }
      };

      try {
        send({ type: "session", sessionId: session.id });
        for await (const event of session.events()) {
          await dispatch(event);
        }
      } catch (error) {
        try {
          send({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Client already gone.
        }
      } finally {
        if (ping) clearInterval(ping);
        releaseSession(session.id);
        controller.close();
      }
    },
    cancel() {
      // Client disconnected mid-session.
      if (ping) clearInterval(ping);
      releaseSession(session.id);
      void session.cancel();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" },
  });
}

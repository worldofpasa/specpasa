import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { newId } from "@specpasa/core";
import { schema } from "@specpasa/db";
import { getDb } from "../../../../lib/db";
import { connect, viewersFor } from "../../../../lib/realtime";

const HEARTBEAT_MS = 15_000;

/**
 * Live event stream for a spec (ADR-6): SSE over the Node target.
 * Events: `comments` (state changed — refetch) and `presence` (viewer list).
 * The connection itself is the presence heartbeat — closing the tab
 * unregisters the viewer.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const specId = params.id!;
  const [spec] = await getDb()
    .select({ id: schema.specs.id })
    .from(schema.specs)
    .where(eq(schema.specs.id, specId));
  if (!spec) return new Response("Spec not found", { status: 404 });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let disconnect: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      disconnect = connect({
        id: newId(),
        specId,
        userId: user.id,
        name: user.name,
        send,
      });
      send("presence", { viewers: viewersFor(specId) });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      disconnect?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};

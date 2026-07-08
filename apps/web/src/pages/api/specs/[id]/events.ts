import type { APIRoute } from "astro";
import { newId } from "@specpasa/core";
import { getMembership } from "../../../../lib/auth";
import { specInWorkspace } from "../../../../lib/authz";
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
  // Object-level authz: the spec must resolve into the caller's workspace
  // (roles are workspace-global today — see lib/authz.ts). 404 either way so
  // foreign ids are indistinguishable from missing ones.
  const { workspace } = await getMembership(user.id);
  if (!(await specInWorkspace(specId, workspace.id))) {
    return new Response("Spec not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  let teardown: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let closed = false;
      // Single teardown path for every exit: client cancel, heartbeat
      // failure, or hub-initiated close (connection cap). Always unregisters
      // presence — a cleared interval alone would leak a ghost viewer.
      // Hoisted declaration: it only runs after disconnect/heartbeat exist.
      function runTeardown() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        disconnect();
        try {
          controller.close();
        } catch {
          // Stream already errored/closed — nothing left to release.
        }
      }
      teardown = runTeardown;
      const disconnect = connect({
        id: newId(),
        specId,
        userId: user.id,
        name: user.name,
        send,
        close: runTeardown,
      });
      send("presence", { viewers: viewersFor(specId) });
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          runTeardown();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      teardown?.();
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

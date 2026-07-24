import type { APIRoute } from "astro";
import { getSessionFor, releaseSession } from "../../../../../lib/interview-sessions";

/** Abort a running interview/conversion session. */
export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const entry = getSessionFor(params.sessionId!, user.id);
  if (!entry) return new Response("Session not found", { status: 404 });

  await entry.session.cancel();
  releaseSession(entry.session.id);
  return new Response(null, { status: 204 });
};

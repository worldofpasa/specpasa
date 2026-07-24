import type { APIRoute } from "astro";
import type { InterviewAnswer } from "@specpasa/providers/node";
import { getSessionFor } from "../../../../../lib/interview-sessions";

/** Resolve a pending question set on a running interview/conversion session. */
export const POST: APIRoute = async ({ request, params, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const entry = getSessionFor(params.sessionId!, user.id);
  if (!entry) return new Response("Session not found", { status: 404 });

  const { questionSetId, answers } = (await request.json()) as {
    questionSetId?: string;
    answers?: InterviewAnswer[];
  };
  if (!questionSetId || !Array.isArray(answers)) {
    return new Response("questionSetId and answers are required", { status: 400 });
  }

  const accepted = entry.session.answer(questionSetId, answers);
  return new Response(null, { status: accepted ? 204 : 409 });
};

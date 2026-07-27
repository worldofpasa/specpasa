import type { APIRoute } from "astro";
import { blocksToMarkdown, canEdit } from "@specpasa/core";
import {
  createInterviewSession,
  INTERVIEW_SKILLS,
  type InterviewSkillName,
} from "@specpasa/providers/node";
import { getMembership } from "../../../lib/auth";
import { specInWorkspace } from "../../../lib/authz";
import { claudeInterviewAvailable } from "../../../lib/claude";
import { getDb, schema, desc, eq } from "../../../lib/db";
import { hasActiveSessionForSpec } from "../../../lib/interview-sessions";
import { sessionResponse } from "../../../lib/interview-stream";
import { t } from "../../../lib/strings";

/**
 * Start an interview session on a draft-phase spec (FR-AI-2 local CLI): the
 * vendored skill drives the locally installed claude CLI; questions surface
 * as `question` events and are answered via the sibling answer route. The
 * evolving document persists into the working-draft buffer (#32) — the user
 * mints an immutable version deliberately after reviewing.
 */

/** All the ways an interview may not start, mapped to their responses. */
async function resolveSpecOrDeny(
  specId: string,
  workspaceId: string,
): Promise<typeof schema.specs.$inferSelect | Response> {
  if (!(await specInWorkspace(specId, workspaceId))) {
    return new Response("Spec not found", { status: 404 });
  }
  const [spec] = await getDb().select().from(schema.specs).where(eq(schema.specs.id, specId));
  if (!spec) return new Response("Spec not found", { status: 404 });
  if (spec.phase !== "draft") {
    return new Response("Interviews run on draft-phase specs", { status: 400 });
  }
  if (spec.status === "frozen") return new Response("Spec is frozen", { status: 403 });
  if (hasActiveSessionForSpec(spec.id)) return new Response(t.interview.busy, { status: 409 });
  if (!(await claudeInterviewAvailable(workspaceId))) {
    return new Response(t.interview.claudeMissing, { status: 400 });
  }
  return spec;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { workspace, role } = await getMembership(user.id);
  if (!canEdit(role)) return new Response("Your role cannot run interviews", { status: 403 });

  const { specId, skill, prompt } = (await request.json()) as {
    specId?: string;
    skill?: string;
    prompt?: string;
  };
  if (!specId || !skill || !(INTERVIEW_SKILLS as readonly string[]).includes(skill)) {
    return new Response("specId and a valid skill are required", { status: 400 });
  }
  const spec = await resolveSpecOrDeny(specId, workspace.id);
  if (spec instanceof Response) return spec;

  const db = getDb();
  const [latest] = await db
    .select()
    .from(schema.spec_versions)
    .where(eq(schema.spec_versions.spec_id, spec.id))
    .orderBy(desc(schema.spec_versions.number))
    .limit(1);
  const seed =
    spec.draft_markdown?.trim() || (latest ? blocksToMarkdown(latest.blocks) : `# ${spec.title}\n`);

  const persistBuffer = async (markdown: string) => {
    await db
      .update(schema.specs)
      .set({ draft_markdown: markdown, draft_saved_at: Date.now(), draft_saved_by: user.id })
      .where(eq(schema.specs.id, spec.id));
  };

  const session = createInterviewSession({
    skill: skill as InterviewSkillName,
    documentMarkdown: seed,
    prompt,
  });

  return sessionResponse(
    { session, userId: user.id, specId: spec.id, startedAt: Date.now() },
    {
      onDocUpdate: persistBuffer,
      onDone: async (markdown) => {
        await persistBuffer(markdown);
      },
    },
  );
};

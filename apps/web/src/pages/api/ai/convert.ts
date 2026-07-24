import type { APIRoute } from "astro";
import {
  blocksFromMarkdown,
  blocksToMarkdown,
  canAdvancePhase,
  canEdit,
  nextPhase,
  parseEpicsFromMarkdown,
} from "@specpasa/core";
import { CONVERSION_SKILLS, createInterviewSession } from "@specpasa/providers/node";
import { getMembership } from "../../../lib/auth";
import { specInWorkspace } from "../../../lib/authz";
import { claudeInterviewAvailable } from "../../../lib/claude";
import { getDb, schema, eq } from "../../../lib/db";
import { deriveNextPhaseSpec } from "../../../lib/derive";
import { hasActiveSessionForSpec } from "../../../lib/interview-sessions";
import { sessionResponse } from "../../../lib/interview-stream";
import { t } from "../../../lib/strings";

/**
 * AI phase conversion: run the phase's conversion skill (draft→prd to-spec,
 * prd→erd to-erd, erd→tasks to-tickets) over the frozen document via the
 * locally installed claude CLI, then derive the next-phase spec with the
 * generated document as version 1. Streams the same event shape as the
 * interview route — conversion skills may ask a clarifying question, answered
 * through the same answer route.
 */
/** All the ways a conversion may not start, mapped to their responses. */
async function resolveConversionOrDeny(
  specId: string,
  workspaceId: string,
): Promise<{ spec: typeof schema.specs.$inferSelect; phase: "prd" | "erd" | "tasks" } | Response> {
  if (!(await specInWorkspace(specId, workspaceId))) {
    return new Response("Spec not found", { status: 404 });
  }
  const [spec] = await getDb().select().from(schema.specs).where(eq(schema.specs.id, specId));
  if (!spec) return new Response("Spec not found", { status: 404 });
  const phase = nextPhase(spec.phase);
  if (!canAdvancePhase(spec) || !phase) {
    return new Response("Only a frozen spec with a next phase can advance", { status: 403 });
  }
  if (hasActiveSessionForSpec(spec.id)) return new Response(t.interview.busy, { status: 409 });
  if (!(await claudeInterviewAvailable(workspaceId))) {
    return new Response(t.interview.claudeMissing, { status: 400 });
  }
  return { spec, phase: phase as "prd" | "erd" | "tasks" };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { workspace, role } = await getMembership(user.id);
  if (!canEdit(role)) return new Response("Your role cannot advance phases", { status: 403 });

  const { specId } = (await request.json()) as { specId?: string };
  if (!specId) return new Response("specId is required", { status: 400 });
  const resolved = await resolveConversionOrDeny(specId, workspace.id);
  if (resolved instanceof Response) return resolved;
  const { spec, phase } = resolved;

  const [frozenVersion] = await getDb()
    .select()
    .from(schema.spec_versions)
    .where(eq(schema.spec_versions.id, spec.current_version_id!));
  if (!frozenVersion) return new Response("Spec has no frozen version", { status: 400 });

  const session = createInterviewSession({
    skill: CONVERSION_SKILLS[phase],
    documentMarkdown: blocksToMarkdown(frozenVersion.blocks),
  });

  return sessionResponse(
    { session, userId: user.id, specId: spec.id, startedAt: Date.now() },
    {
      onDone: async (markdown) => {
        // A tasks document must survive the epics parser before it becomes a
        // spec — a malformed one would break structuring/export downstream.
        if (phase === "tasks") {
          const epics = parseEpicsFromMarkdown(markdown);
          if (!epics.some((epic) => epic.tasks.length > 0)) {
            throw new Error(t.interview.badTicketFormat);
          }
        }
        const { id } = await deriveNextPhaseSpec({
          spec,
          phase,
          blocks: blocksFromMarkdown(markdown),
          summary: `${t.lifecycle.derivedFrom(spec.phase)} (AI)`,
          userId: user.id,
          aiGenerated: true,
        });
        return { specId: id };
      },
    },
  );
};

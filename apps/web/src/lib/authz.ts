import { and, eq } from "drizzle-orm";
import { schema } from "@specpasa/db";
import { getDb } from "./db";

/**
 * Object-level authorization helpers. Roles are workspace-global today
 * (project_members exists in the schema but is not yet enforced), so the
 * workspace is the authorization boundary: a spec or thread is accessible
 * iff it resolves into the caller's workspace via spec → intent → project.
 */

export async function specInWorkspace(specId: string, workspaceId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.specs.id })
    .from(schema.specs)
    .innerJoin(schema.intents, eq(schema.specs.intent_id, schema.intents.id))
    .innerJoin(schema.projects, eq(schema.intents.project_id, schema.projects.id))
    .where(and(eq(schema.specs.id, specId), eq(schema.projects.workspace_id, workspaceId)))
    .limit(1);
  return Boolean(row);
}

/** The thread's spec id if the thread resolves into the workspace, else null. */
export async function threadSpecInWorkspace(
  threadId: string,
  workspaceId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ spec_id: schema.comment_threads.spec_id })
    .from(schema.comment_threads)
    .innerJoin(schema.specs, eq(schema.comment_threads.spec_id, schema.specs.id))
    .innerJoin(schema.intents, eq(schema.specs.intent_id, schema.intents.id))
    .innerJoin(schema.projects, eq(schema.intents.project_id, schema.projects.id))
    .where(
      and(eq(schema.comment_threads.id, threadId), eq(schema.projects.workspace_id, workspaceId)),
    )
    .limit(1);
  return row?.spec_id ?? null;
}

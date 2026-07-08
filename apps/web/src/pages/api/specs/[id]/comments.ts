import type { APIRoute } from "astro";
import { getMembership } from "../../../../lib/auth";
import { specInWorkspace } from "../../../../lib/authz";
import { getDb, schema, asc, eq } from "../../../../lib/db";

export interface ThreadPayload {
  id: string;
  block_id: string;
  resolved: boolean;
  comments: { id: string; author: string; body: string; created_at: number }[];
}

/** Comment state for a spec — polled by the Comments island (FR-COLLAB-5). */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });
  // Object-level authz: same workspace-scope rule as the SSE stream.
  const { workspace } = await getMembership(locals.user.id);
  if (!(await specInWorkspace(params.id!, workspace.id))) {
    return new Response("Spec not found", { status: 404 });
  }
  const db = getDb();
  const threads = await db
    .select()
    .from(schema.comment_threads)
    .where(eq(schema.comment_threads.spec_id, params.id!))
    .orderBy(asc(schema.comment_threads.created_at));

  const rows = await db
    .select({
      id: schema.comments.id,
      thread_id: schema.comments.thread_id,
      body: schema.comments.body,
      created_at: schema.comments.created_at,
      author: schema.users.name,
    })
    .from(schema.comments)
    .innerJoin(schema.comment_threads, eq(schema.comments.thread_id, schema.comment_threads.id))
    .innerJoin(schema.users, eq(schema.comments.author_id, schema.users.id))
    .where(eq(schema.comment_threads.spec_id, params.id!))
    .orderBy(asc(schema.comments.created_at));

  const byThread = new Map<string, ThreadPayload["comments"]>();
  for (const row of rows) {
    const list = byThread.get(row.thread_id) ?? [];
    list.push({ id: row.id, author: row.author, body: row.body, created_at: row.created_at });
    byThread.set(row.thread_id, list);
  }

  const payload: ThreadPayload[] = threads.map((thread) => ({
    id: thread.id,
    block_id: thread.block_id,
    resolved: Boolean(thread.resolved_at),
    comments: byThread.get(thread.id) ?? [],
  }));

  return new Response(JSON.stringify({ threads: payload }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

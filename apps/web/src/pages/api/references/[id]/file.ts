import type { APIRoute } from "astro";
import { getMembership } from "../../../../lib/auth";
import { specInWorkspace } from "../../../../lib/authz";
import { getDb, schema, eq } from "../../../../lib/db";
import { readUpload, type FilePayload } from "../../../../lib/uploads";

/** Serve an uploaded file reference (FR-REF `file` kind, #24) — workspace-
 * scoped authz like every other spec surface. */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [reference] = await getDb()
    .select()
    .from(schema.spec_references)
    .where(eq(schema.spec_references.id, params.id!));
  if (!reference || reference.kind !== "file" || !reference.payload) {
    return new Response("Not found", { status: 404 });
  }

  const { workspace } = await getMembership(user.id);
  if (!(await specInWorkspace(reference.spec_id, workspace.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const payload = reference.payload as unknown as FilePayload;
  let body: Buffer;
  try {
    body = await readUpload(payload);
  } catch {
    return new Response("File missing from storage", { status: 404 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": payload.mime,
      "content-disposition": `inline; filename="${payload.file_name.replaceAll('"', "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
};

import { newId } from "@specpasa/core";
import { getDb, schema } from "./db";
import { t } from "./strings";

/**
 * First-run owner provisioning, shared by the setup action (password signup)
 * and desktop local auto-login (passwordless OS user): creates the owner
 * user, the single workspace (FR-TEN-1), the owner membership, and an
 * enabled local_cli provider per detected CLI (FR-AI-5 — CLIs need no key or
 * model choice, so there is nothing to ask).
 */
export async function provisionOwner(input: {
  name: string;
  email: string;
  /** null for trusted local auto-login — password login stays disabled. */
  passwordHash: string | null;
  workspaceName: string;
  /** Supported CLI commands detected on this host. */
  cliCommands: readonly string[];
}): Promise<{ userId: string; workspaceId: string }> {
  const db = getDb();
  const ts = Date.now();
  const userId = newId();
  const workspaceId = newId();
  await db.insert(schema.users).values({
    id: userId,
    email: input.email,
    name: input.name,
    password_hash: input.passwordHash,
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: input.workspaceName,
    slug: input.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    created_by: userId,
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.memberships).values({
    id: newId(),
    workspace_id: workspaceId,
    user_id: userId,
    role: "owner",
    created_at: ts,
  });
  for (const command of input.cliCommands) {
    await db.insert(schema.ai_provider_configs).values({
      id: newId(),
      workspace_id: workspaceId,
      kind: "local_cli",
      name: t.providers.autoAddedName(command),
      cli_command: command,
      enabled: true,
      created_at: ts,
      updated_at: ts,
    });
  }
  return { userId, workspaceId };
}

import { findExecutableOnPath } from "@specpasa/providers/node";
import { getDb, schema, and, eq, isNull, or } from "./db";

/**
 * Interview/conversion sessions need the claude binary on this host's PATH
 * AND an enabled Claude CLI provider config (the workspace's opt-in to local
 * CLI AI, FR-AI-2/FR-AI-5) — the spec page uses this to decide whether to
 * offer the panel, the routes to reject with guidance.
 */
export async function claudeInterviewAvailable(workspaceId: string): Promise<boolean> {
  if (!findExecutableOnPath("claude")) return false;
  const [config] = await getDb()
    .select({ id: schema.ai_provider_configs.id })
    .from(schema.ai_provider_configs)
    .where(
      and(
        eq(schema.ai_provider_configs.enabled, true),
        eq(schema.ai_provider_configs.kind, "local_cli"),
        eq(schema.ai_provider_configs.cli_command, "claude"),
        or(
          eq(schema.ai_provider_configs.workspace_id, workspaceId),
          isNull(schema.ai_provider_configs.workspace_id),
        ),
      ),
    )
    .limit(1);
  return Boolean(config);
}

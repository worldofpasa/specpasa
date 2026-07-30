import { newId } from "@specpasa/core";
import { findExecutableOnPath, SUPPORTED_CLI_COMMANDS } from "@specpasa/providers/node";
import { getDb, schema, and, eq, isNull, or } from "./db";
import { t } from "./strings";

/** Auto-detect defaults ON; the workspace opts out via settings. */
export function autoDetectEnabled(workspace: {
  settings: Record<string, unknown> | null;
}): boolean {
  return workspace.settings?.auto_detect !== false;
}

/**
 * Auto-provision local CLI providers (FR-AI-5): every supported CLI found on
 * this host's PATH gets an enabled config row the first time it is seen, so
 * detected agents are usable instantly — no manual add step. Opting out is
 * DISABLING the row in settings, never deleting it: any existing row
 * (enabled or not, workspace or global) blocks re-provisioning, so a
 * disabled CLI stays disabled across restarts and re-detections. The whole
 * mechanism can be turned off per workspace (settings.auto_detect = false).
 */
export async function syncDetectedCliProviders(workspace: {
  id: string;
  settings: Record<string, unknown> | null;
}): Promise<void> {
  if (!autoDetectEnabled(workspace)) return;
  const workspaceId = workspace.id;
  const detected = SUPPORTED_CLI_COMMANDS.filter((command) => findExecutableOnPath(command));
  if (detected.length === 0) return;
  const db = getDb();
  const existing = await db
    .select({ cli_command: schema.ai_provider_configs.cli_command })
    .from(schema.ai_provider_configs)
    .where(
      and(
        eq(schema.ai_provider_configs.kind, "local_cli"),
        or(
          eq(schema.ai_provider_configs.workspace_id, workspaceId),
          isNull(schema.ai_provider_configs.workspace_id),
        ),
      ),
    );
  const known = new Set(existing.map((row) => row.cli_command));
  const ts = Date.now();
  for (const command of detected) {
    if (known.has(command)) continue;
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
}

import { newId } from "@specpasa/core";
import { detectLocalProviders } from "@specpasa/providers";
import { findExecutableOnPath, SUPPORTED_CLI_COMMANDS } from "@specpasa/providers/node";
import { getDb, schema, eq, isNull, or } from "./db";
import { t } from "./strings";

/** Auto-detect defaults ON; the workspace opts out via settings. */
export function autoDetectEnabled(workspace: {
  settings: Record<string, unknown> | null;
}): boolean {
  return workspace.settings?.auto_detect !== false;
}

/**
 * Auto-provision local AI providers (FR-AI-5): every supported CLI found on
 * this host's PATH — and a running Ollama with at least one pulled model —
 * gets an enabled config row the first time it is seen, so detected backends
 * are usable instantly with no manual add step. Opting out is DISABLING the
 * row in settings, never deleting it: any existing row (enabled or not,
 * workspace or global) blocks re-provisioning, so a disabled backend stays
 * off across restarts and re-detections. The whole mechanism can be turned
 * off per workspace (settings.auto_detect = false).
 */
export async function syncDetectedLocalProviders(workspace: {
  id: string;
  settings: Record<string, unknown> | null;
}): Promise<void> {
  if (!autoDetectEnabled(workspace)) return;
  const db = getDb();
  const ts = Date.now();
  const existing = await db
    .select({
      kind: schema.ai_provider_configs.kind,
      cli_command: schema.ai_provider_configs.cli_command,
    })
    .from(schema.ai_provider_configs)
    .where(
      or(
        eq(schema.ai_provider_configs.workspace_id, workspace.id),
        isNull(schema.ai_provider_configs.workspace_id),
      ),
    );

  const knownCommands = new Set(
    existing.filter((row) => row.kind === "local_cli").map((row) => row.cli_command),
  );
  for (const command of SUPPORTED_CLI_COMMANDS) {
    if (knownCommands.has(command) || !findExecutableOnPath(command)) continue;
    await db.insert(schema.ai_provider_configs).values({
      id: newId(),
      workspace_id: workspace.id,
      kind: "local_cli",
      name: t.providers.autoAddedName(command),
      cli_command: command,
      enabled: true,
      created_at: ts,
      updated_at: ts,
    });
  }

  // Ollama: probe only while no config exists at all (the steady state skips
  // the network round-trip). Provisioned with the first pulled model — add
  // more configs manually for other models.
  if (!existing.some((row) => row.kind === "ollama")) {
    const [ollama] = await detectLocalProviders();
    const model = ollama?.models?.[0];
    if (model) {
      await db.insert(schema.ai_provider_configs).values({
        id: newId(),
        workspace_id: workspace.id,
        kind: "ollama",
        name: t.providers.autoAddedOllamaName(model),
        model,
        enabled: true,
        created_at: ts,
        updated_at: ts,
      });
    }
  }
}

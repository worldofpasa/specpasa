/**
 * PROTOTYPE — throwaway. Shared prop shapes for the providers-page variants.
 * Three variants of /settings/providers merging the detection panel into the
 * provider list, switchable via ?variant= (dev only). Deleted when one wins.
 */
import type { schema } from "../../lib/db";

export type ProviderConfigRow = typeof schema.ai_provider_configs.$inferSelect;

export interface PrototypeRow {
  config: ProviderConfigRow;
  icon: string;
  kindLabel: string;
  /** Runs on this machine (local_cli / ollama) as opposed to a cloud API. */
  isLocal: boolean;
  /** Detection detail (CLI path, ollama models) when the backend is live on
   * this host right now; null = local-but-not-detected or cloud. */
  detectedDetail: string | null;
}

/** Detected on this host but not configured yet (e.g. Ollama before adding). */
export interface PrototypeGhost {
  icon: string;
  name: string;
  detail: string;
  /** Add-modal preset to preselect. */
  preset: string;
}

/** Supported CLI that is not on PATH (variant B shows these dimmed). */
export interface PrototypeMissing {
  command: string;
  icon: string;
}

export interface ProvidersPrototypeData {
  rows: PrototypeRow[];
  ghosts: PrototypeGhost[];
  missing: PrototypeMissing[];
  autoDetect: boolean;
}

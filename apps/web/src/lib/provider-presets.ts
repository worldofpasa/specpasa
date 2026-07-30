import type { AiProviderKind } from "@specpasa/core";
import { t } from "./strings";

/**
 * UI catalog for the "Add cloud provider" flow (FR-AI-4). Every entry is
 * served by the one OpenAI-compatible adapter (ADR-4); `kind` decides which
 * DB kind the config row gets — `openrouter`/`google` have factory-known
 * default base URLs, everything else stores its base URL explicitly as
 * `openai_compatible`.
 */
export interface ProviderPreset {
  id: string;
  label: string;
  kind: AiProviderKind;
  /** Prefilled API root; null = user must supply one (custom endpoints). */
  baseUrl: string | null;
  requiresKey: boolean;
}

export const CLOUD_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    label: t.providers.presets.openrouter,
    kind: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
  },
  {
    id: "openai",
    label: t.providers.presets.openai,
    kind: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    requiresKey: true,
  },
  {
    id: "google",
    label: t.providers.presets.google,
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requiresKey: true,
  },
  {
    id: "xai",
    label: t.providers.presets.xai,
    kind: "openai_compatible",
    baseUrl: "https://api.x.ai/v1",
    requiresKey: true,
  },
  {
    id: "cohere",
    label: t.providers.presets.cohere,
    kind: "openai_compatible",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    requiresKey: true,
  },
  {
    id: "together",
    label: t.providers.presets.together,
    kind: "openai_compatible",
    baseUrl: "https://api.together.xyz/v1",
    requiresKey: true,
  },
  {
    id: "custom",
    label: t.providers.presets.custom,
    kind: "openai_compatible",
    baseUrl: null,
    requiresKey: false,
  },
];

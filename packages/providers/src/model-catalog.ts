import { type AiProviderKind } from "@specpasa/core";
import { OPENAI_COMPAT_PRESETS, type OpenAiCompatibleKind } from "./factory.js";
import { OLLAMA_DEFAULT_BASE_URL } from "./ollama.js";

export interface CatalogModel {
  id: string;
  label: string;
}

export interface ModelCatalogQuery {
  kind: AiProviderKind;
  baseUrl?: string | null;
  /** Already decrypted — this package never sees encrypted payloads. */
  apiKey?: string | null;
}

const CATALOG_TIMEOUT_MS = 5000;

/**
 * Best-effort model listing for a provider (FR-AI-3/4): feeds the model
 * pickers in settings. Every failure — endpoint down, bad key, no /models
 * route — returns [] so the UI falls back to free-text input.
 */
export async function listProviderModels(query: ModelCatalogQuery): Promise<CatalogModel[]> {
  try {
    switch (query.kind) {
      case "anthropic":
        return await listAnthropicModels(query.apiKey);
      case "ollama":
        return await listOllamaModels(query.baseUrl);
      case "openai_compatible":
      case "openrouter":
      case "google":
        return await listOpenAiCompatibleModels(query.kind, query.baseUrl, query.apiKey);
      default:
        // local_cli models aren't enumerable from outside the CLI.
        return [];
    }
  } catch {
    return [];
  }
}

async function listAnthropicModels(apiKey: string | null | undefined): Promise<CatalogModel[]> {
  if (!apiKey) return [];
  const response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { data?: { id: string; display_name?: string }[] };
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

async function listOllamaModels(baseUrl: string | null | undefined): Promise<CatalogModel[]> {
  const root = (baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${root}/api/tags`, {
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => ({ id: m.name, label: m.name }));
}

async function listOpenAiCompatibleModels(
  kind: OpenAiCompatibleKind,
  baseUrl: string | null | undefined,
  apiKey: string | null | undefined,
): Promise<CatalogModel[]> {
  const root = (baseUrl ?? OPENAI_COMPAT_PRESETS[kind].baseUrl)?.replace(/\/$/, "");
  if (!root) return [];
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${root}/models`, {
    headers,
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { data?: { id: string; name?: string }[] };
  return (data.data ?? []).map((m) => ({ id: m.id, label: m.name ?? m.id }));
}

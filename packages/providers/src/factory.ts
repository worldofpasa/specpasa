import { assertNever, type AiProviderKind } from "@specpasa/core";
import { createAnthropicAgent } from "./anthropic.js";
import { createOllamaAgent } from "./ollama.js";
import { type SpecAgent } from "./types.js";

/** Kinds with a working adapter today. Widen as adapters land (never wider
 * than AI_PROVIDER_KINDS — the satisfies clause enforces membership). */
export const IMPLEMENTED_AI_PROVIDER_KINDS = [
  "anthropic",
  "ollama",
] as const satisfies readonly AiProviderKind[];
export type ImplementedAiProviderKind = (typeof IMPLEMENTED_AI_PROVIDER_KINDS)[number];

export class ProviderConfigError extends Error {}
export class ProviderNotImplementedError extends Error {
  constructor(kind: AiProviderKind, milestone: string) {
    super(`Provider "${kind}" is not implemented yet (scheduled for ${milestone})`);
  }
}

export interface AgentConfigInput {
  kind: AiProviderKind;
  model: string | null;
  baseUrl: string | null;
  /** Already decrypted — this package never sees encrypted payloads. */
  apiKey: string | null;
}

function anthropicFromConfig(config: AgentConfigInput): SpecAgent {
  if (!config.apiKey) throw new ProviderConfigError("Anthropic requires an API key");
  return createAnthropicAgent({ apiKey: config.apiKey, model: config.model ?? undefined });
}

function ollamaFromConfig(config: AgentConfigInput): SpecAgent {
  if (!config.model) throw new ProviderConfigError("Ollama requires a model name");
  return createOllamaAgent({ model: config.model, baseUrl: config.baseUrl ?? undefined });
}

/**
 * The single dispatch point from a stored provider config to a SpecAgent
 * (ADR-4). The switch is exhaustive over AiProviderKind: adding a new kind
 * to core without handling it here is a compile error, not a runtime null.
 */
export function createSpecAgent(config: AgentConfigInput): SpecAgent {
  switch (config.kind) {
    case "anthropic":
      return anthropicFromConfig(config);
    case "ollama":
      return ollamaFromConfig(config);
    case "openai_compatible":
    case "openrouter":
    case "google":
      throw new ProviderNotImplementedError(config.kind, "M2+");
    case "local_cli":
      throw new ProviderNotImplementedError(config.kind, "M5");
    default:
      return assertNever(config.kind, "AiProviderKind");
  }
}

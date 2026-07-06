import { type SpecAgent } from "./types.js";

const notImplemented = (what: string, milestone: string) => () => {
  throw new Error(`NotImplemented: ${what} adapter is scheduled for ${milestone}`);
};

/** OpenAI-compatible HTTP — covers OpenAI, OpenRouter, Google's
 * OpenAI-compat endpoint, and any custom base URL. First cloud adapter (M1). */
export const createOpenAiCompatibleAgent: (config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}) => SpecAgent = notImplemented("openai_compatible", "M1");

/** Ollama HTTP on localhost:11434 (M1). */
export const createOllamaAgent: (config: { baseUrl?: string; model: string }) => SpecAgent =
  notImplemented("ollama", "M1");

/** Anthropic SDK (M1). */
export const createAnthropicAgent: (config: { apiKey: string; model: string }) => SpecAgent =
  notImplemented("anthropic", "M1");

/** Local CLI subprocess (claude, codex) — Node deploy target only (M5). */
export const createLocalCliAgent: (config: { command: string }) => SpecAgent = notImplemented(
  "local_cli",
  "M5",
);

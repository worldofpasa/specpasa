import { type SpecAgent } from "./types.js";

const notImplemented = (what: string, milestone: string) => () => {
  throw new Error(`NotImplemented: ${what} adapter is scheduled for ${milestone}`);
};

/** OpenAI-compatible HTTP — covers OpenAI, OpenRouter, Google's
 * OpenAI-compat endpoint, and any custom base URL (post-M1). */
export const createOpenAiCompatibleAgent: (config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}) => SpecAgent = notImplemented("openai_compatible", "M2+");

/** Local CLI subprocess (claude, codex) — Node deploy target only (M5). */
export const createLocalCliAgent: (config: { command: string }) => SpecAgent = notImplemented(
  "local_cli",
  "M5",
);

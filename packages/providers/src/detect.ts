import { OLLAMA_DEFAULT_BASE_URL } from "./ollama.js";
import { type DetectedProvider } from "./types.js";

/**
 * Probe the host for local AI backends (ADR-4). Only meaningful on the Node
 * deploy target — the Cloudflare target reports cloud providers only (ADR-2).
 * M1 probes Ollama; local CLI detection (claude, codex) lands in M5.
 */
export async function detectLocalProviders(
  ollamaBaseUrl = OLLAMA_DEFAULT_BASE_URL,
): Promise<DetectedProvider[]> {
  const detected: DetectedProvider[] = [];
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const data = (await response.json()) as { models?: { name: string }[] };
      const models = (data.models ?? []).map((m) => m.name);
      detected.push({
        kind: "ollama",
        name: "Ollama",
        detail: models.length ? `models: ${models.join(", ")}` : "running, no models pulled",
        models,
      });
    }
  } catch {
    // Not running — absence is a valid detection result, not an error.
  }
  return detected;
}

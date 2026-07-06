import { type DetectedProvider } from "./types.js";

/**
 * Probe the host for local AI backends: known CLIs on PATH (claude, codex)
 * and an Ollama server on localhost:11434. Only meaningful on the Node
 * deploy target — the Cloudflare target reports cloud providers only
 * (ADR-2, ADR-4). Implementation lands in M1 (Ollama) and M5 (CLIs).
 */
export function detectLocalProviders(): Promise<DetectedProvider[]> {
  throw new Error("NotImplemented: scheduled for M1 (ollama) / M5 (local CLIs)");
}

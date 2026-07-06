import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { detectLocalProviders } from "../detect.js";
import { type DetectedProvider } from "../types.js";
import { SUPPORTED_CLI_COMMANDS } from "./local-cli.js";

/** CLIs we probe for on PATH (FR-AI-5). codex is reported when found even
 * though its adapter is a follow-up — the UI says which are usable. */
const KNOWN_CLIS = ["claude", "codex"] as const;

export function findExecutableOnPath(
  command: string,
  pathVar: string | undefined = process.env.PATH,
): string | null {
  for (const dir of (pathVar ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep scanning
    }
  }
  return null;
}

function detectCliProviders(): DetectedProvider[] {
  const detected: DetectedProvider[] = [];
  for (const command of KNOWN_CLIS) {
    const path = findExecutableOnPath(command);
    if (path) {
      const usable = (SUPPORTED_CLI_COMMANDS as readonly string[]).includes(command);
      detected.push({
        kind: "local_cli",
        name: `${command} CLI`,
        detail: usable ? path : `${path} (detected — adapter support coming)`,
      });
    }
  }
  return detected;
}

/**
 * Full host capability probe: Ollama (portable fetch probe from the root
 * export) plus PATH CLIs. Node deploy target only (ADR-2) — the Cloudflare
 * target uses the root detectLocalProviders and reports cloud kinds only.
 */
export async function detectLocalProvidersNode(
  ollamaBaseUrl?: string,
): Promise<DetectedProvider[]> {
  return [...(await detectLocalProviders(ollamaBaseUrl)), ...detectCliProviders()];
}

import anthropic from "../assets/provider-icons/anthropic.svg?raw";
import claudecode from "../assets/provider-icons/claudecode.svg?raw";
import codex from "../assets/provider-icons/codex.svg?raw";
import cohere from "../assets/provider-icons/cohere.svg?raw";
import cursor from "../assets/provider-icons/cursor.svg?raw";
import gemini from "../assets/provider-icons/gemini.svg?raw";
import grok from "../assets/provider-icons/grok.svg?raw";
import ollama from "../assets/provider-icons/ollama.svg?raw";
import openai from "../assets/provider-icons/openai.svg?raw";
import openrouter from "../assets/provider-icons/openrouter.svg?raw";
import together from "../assets/provider-icons/together.svg?raw";
import xai from "../assets/provider-icons/xai.svg?raw";

/** Generic fallbacks, drawn in the same lucide style as the page's inline
 * pencil/trash icons — for kinds with no single brand (custom endpoint, CLI). */
const terminal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>`;
const plug = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>`;

/** Raw inline SVG per Add-modal preset id (provider-presets.ts + the
 * anthropic/ollama/local_cli built-ins). */
const PRESET_ICONS: Record<string, string> = {
  anthropic,
  openai,
  openrouter,
  google: gemini,
  xai,
  cohere,
  together,
  custom: plug,
  ollama,
  local_cli: terminal,
};

/** Brand icon per supported CLI command. */
const CLI_ICONS: Record<string, string> = {
  claude: claudecode,
  codex,
  "cursor-agent": cursor,
  grok,
};

export function iconForPreset(presetId: string): string {
  return PRESET_ICONS[presetId] ?? plug;
}

/** Well-known hosts behind `openai_compatible` configs, which carry no brand
 * marker beyond their base URL. */
const HOST_ICONS: [suffix: string, icon: string][] = [
  ["openai.com", openai],
  ["x.ai", xai],
  ["cohere.ai", cohere],
  ["cohere.com", cohere],
  ["together.xyz", together],
  ["together.ai", together],
];

/** Icon for a stored config row or a detection entry. */
export function iconForProvider(
  kind: string,
  cliCommand?: string | null,
  baseUrl?: string | null,
): string {
  if (kind === "local_cli") return (cliCommand && CLI_ICONS[cliCommand]) || terminal;
  if (kind === "openai_compatible") {
    const host = hostOf(baseUrl);
    return HOST_ICONS.find(([suffix]) => host.endsWith(suffix))?.[1] ?? plug;
  }
  return PRESET_ICONS[kind] ?? plug;
}

function hostOf(baseUrl: string | null | undefined): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

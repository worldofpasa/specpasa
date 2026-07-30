import { createSpecAgent, ProviderConfigError, type AgentConfigInput } from "../factory.js";
import { parseProviderSettings } from "../settings.js";
import { type SpecAgent } from "../types.js";
import { createLocalCliAgent, isSupportedCliCommand } from "./local-cli.js";

/**
 * Node-target factory (ADR-2): handles local_cli by spawning the host CLI
 * and delegates every other kind to the runtime-agnostic root factory. The
 * web app (Node adapter) uses this; a Cloudflare build imports the root
 * factory only and never pulls node:child_process into its bundle.
 */
export function createSpecAgentNode(config: AgentConfigInput): SpecAgent {
  if (config.kind !== "local_cli") return createSpecAgent(config);
  if (!config.cliCommand || !isSupportedCliCommand(config.cliCommand)) {
    throw new ProviderConfigError(
      `Local CLI provider requires a supported command (${config.cliCommand ?? "none"} given)`,
    );
  }
  const settings = parseProviderSettings(config.settings);
  return createLocalCliAgent({
    command: config.cliCommand,
    model: config.model ?? undefined,
    extraArgs: settings.extraArgs,
    systemPromptOverride: settings.systemPromptOverride,
  });
}

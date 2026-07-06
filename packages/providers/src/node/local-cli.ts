import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { blocksFromMarkdown } from "@specpasa/core";
import { systemPrompt, userPrompt } from "../prompts.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "../types.js";
import { parseClaudeStreamLine } from "./claude-stream.js";

/**
 * Commands the adapter is allowed to spawn. Never widen this from stored
 * data — cli_command comes from the database and must not become an
 * arbitrary-command execution vector. codex is detected (see detect) but its
 * `--json` event protocol differs; adapter support is a follow-up.
 */
export const SUPPORTED_CLI_COMMANDS = ["claude"] as const;
export type SupportedCliCommand = (typeof SUPPORTED_CLI_COMMANDS)[number];

export function isSupportedCliCommand(command: string): command is SupportedCliCommand {
  return (SUPPORTED_CLI_COMMANDS as readonly string[]).includes(command);
}

export interface LocalCliAgentConfig {
  command: SupportedCliCommand;
  /** Kill the subprocess after this long (default 10 minutes). */
  timeoutMs?: number;
}

const CLI_ARGS: Record<SupportedCliCommand, (system: string) => string[]> = {
  claude: (system) => [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--system-prompt",
    system,
  ],
};

/** Prefer accumulated deltas; fall back to the result line (covers CLI
 * versions/paths that emit no partial messages). */
function pickMarkdown(deltas: string, resultText: string | null): string {
  return deltas || resultText || "";
}

function exitFailureEvent(
  command: string,
  exitCode: number | null,
  stderr: string,
): AgentEvent | null {
  if (exitCode === 0) return null;
  return {
    type: "error",
    message: `${command} exited with code ${String(exitCode)}: ${stderr.slice(0, 500)}`,
  };
}

/** Local CLI adapter (ADR-4) — Node deploy target only (ADR-2). The user
 * prompt goes over stdin to avoid argv length/quoting issues. */
export function createLocalCliAgent(config: LocalCliAgentConfig): SpecAgent {
  const timeoutMs = config.timeoutMs ?? 10 * 60 * 1000;

  async function* run(
    request: AgentRequest,
    mode: "draft" | "refine" | "summarize",
  ): AsyncIterable<AgentEvent> {
    let text = "";
    let resultText: string | null = null;
    let errored = false;
    try {
      const child = spawn(config.command, CLI_ARGS[config.command](systemPrompt(request)), {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const killTimer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdin.end(userPrompt(request, mode));

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

      for await (const line of createInterface({ input: child.stdout })) {
        const item = parseClaudeStreamLine(line);
        if (item.kind === "token") {
          text += item.text;
          yield { type: "token", text: item.text };
        } else if (item.kind === "result") {
          resultText = item.text;
        } else if (item.kind === "error") {
          errored = true;
          yield { type: "error", message: item.message };
        }
      }

      const exitCode = await new Promise<number | null>((resolve) => {
        child.once("close", resolve);
      });
      clearTimeout(killTimer);

      if (errored) return;
      const exitFailure = exitFailureEvent(config.command, exitCode, stderr);
      if (exitFailure) {
        yield exitFailure;
        return;
      }
      yield {
        type: "done",
        blocks: blocksFromMarkdown(pickMarkdown(text, resultText), request.blocks),
      };
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    kind: "local_cli",
    name: `${config.command} CLI`,
    draft: (request) => run(request, "draft"),
    refine: (request) => run(request, "refine"),
    summarize: (request) => run(request, "summarize"),
  };
}

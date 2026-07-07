import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { blocksFromMarkdown } from "@specpasa/core";
import { systemPrompt, userPrompt } from "../prompts.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "../types.js";
import { parseClaudeStreamLine } from "./claude-stream.js";
import { parseCodexStreamLine } from "./codex-stream.js";

/**
 * Commands the adapter is allowed to spawn. Never widen this from stored
 * data — cli_command comes from the database and must not become an
 * arbitrary-command execution vector.
 */
export const SUPPORTED_CLI_COMMANDS = ["claude", "codex"] as const;
export type SupportedCliCommand = (typeof SUPPORTED_CLI_COMMANDS)[number];

export function isSupportedCliCommand(command: string): command is SupportedCliCommand {
  return (SUPPORTED_CLI_COMMANDS as readonly string[]).includes(command);
}

export interface LocalCliAgentConfig {
  command: SupportedCliCommand;
  /** Kill the subprocess after this long (default 10 minutes). */
  timeoutMs?: number;
}

/** Per-command wire protocol: argv, stdin payload, and stdout-line handling. */
interface CliSession {
  args: string[];
  stdinPayload: string;
  /** Map one stdout line to an incremental token and/or an error. */
  handleLine(line: string): { token?: string; error?: string };
  /** Final markdown given the accumulated token text (fallbacks applied). */
  finalMarkdown(accumulated: string): string;
}

function claudeSession(system: string, user: string): CliSession {
  let resultText: string | null = null;
  return {
    args: [
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--system-prompt",
      system,
    ],
    stdinPayload: user,
    handleLine(line) {
      const item = parseClaudeStreamLine(line);
      if (item.kind === "token") return { token: item.text };
      if (item.kind === "result") resultText = item.text;
      if (item.kind === "error") return { error: item.message };
      return {};
    },
    // Prefer accumulated deltas; the result line covers CLI versions/paths
    // that emit no partial messages.
    finalMarkdown: (accumulated) => accumulated || resultText || "",
  };
}

function codexSession(system: string, user: string): CliSession {
  // codex has no separate system-prompt channel in exec mode; prepend it.
  // Agent messages arrive whole per item id — dedup by emitted length so a
  // defensive item.updated followed by item.completed emits each char once.
  const emittedLength = new Map<string, number>();
  return {
    args: [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-s",
      "read-only",
      "-",
    ],
    stdinPayload: `${system}\n\n${user}`,
    handleLine(line) {
      const item = parseCodexStreamLine(line);
      if (item.kind === "message") {
        const previous = emittedLength.get(item.id) ?? 0;
        emittedLength.set(item.id, Math.max(previous, item.text.length));
        const token = item.text.slice(previous);
        return token ? { token } : {};
      }
      if (item.kind === "error") return { error: item.message };
      return {};
    },
    finalMarkdown: (accumulated) => accumulated,
  };
}

const CLI_SESSIONS: Record<SupportedCliCommand, (system: string, user: string) => CliSession> = {
  claude: claudeSession,
  codex: codexSession,
};

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
    let errored = false;
    try {
      const session = CLI_SESSIONS[config.command](systemPrompt(request), userPrompt(request, mode));
      const child = spawn(config.command, session.args, { stdio: ["pipe", "pipe", "pipe"] });
      const killTimer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdin.end(session.stdinPayload);

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

      for await (const line of createInterface({ input: child.stdout })) {
        const { token, error } = session.handleLine(line);
        if (token) {
          text += token;
          yield { type: "token", text: token };
        }
        if (error) {
          errored = true;
          yield { type: "error", message: error };
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
        blocks: blocksFromMarkdown(session.finalMarkdown(text), request.blocks),
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

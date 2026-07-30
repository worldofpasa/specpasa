import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { blocksFromMarkdown } from "@specpasa/core";
import { ProviderConfigError } from "../factory.js";
import { systemPrompt, userPrompt } from "../prompts.js";
import { validateExtraArgs } from "../settings.js";
import { type AgentEvent, type AgentRequest, type SpecAgent } from "../types.js";
import { parseClaudeStreamLine } from "./claude-stream.js";
import { parseCodexStreamLine } from "./codex-stream.js";
import { parseCursorStreamLine } from "./cursor-stream.js";

/**
 * Commands the adapter is allowed to spawn. Never widen this from stored
 * data — cli_command comes from the database and must not become an
 * arbitrary-command execution vector.
 */
export const SUPPORTED_CLI_COMMANDS = ["claude", "codex", "cursor-agent", "grok"] as const;
export type SupportedCliCommand = (typeof SUPPORTED_CLI_COMMANDS)[number];

export function isSupportedCliCommand(command: string): command is SupportedCliCommand {
  return (SUPPORTED_CLI_COMMANDS as readonly string[]).includes(command);
}

export interface LocalCliAgentConfig {
  command: SupportedCliCommand;
  /** Passed via the command's model flag (see MODEL_FLAGS). */
  model?: string;
  /** Extra argv entries — validated by validateExtraArgs, never a binary. */
  extraArgs?: string[];
  /** Appended to the built-in system prompt (see prompts.ts). */
  systemPromptOverride?: string;
  /** Kill the subprocess after this long (default 10 minutes). */
  timeoutMs?: number;
}

/** Bound stderr accumulation — a noisy subprocess must not grow memory unbounded. */
const STDERR_CAP = 8 * 1024;

/** Per-command model flag. All four document --model today; if a CLI drops
 * it, remove the entry here so the model is unused rather than a hard error. */
const MODEL_FLAGS: Record<SupportedCliCommand, string> = {
  claude: "--model",
  codex: "--model",
  "cursor-agent": "--model",
  grok: "--model",
};

/** Config-driven argv additions, ordered model-flag-first. Placement within
 * the command's own argv matters and is decided per session builder. */
export interface CliSessionOptions {
  model?: string;
  extraArgs?: string[];
}

function optionArgs(command: SupportedCliCommand, options: CliSessionOptions): string[] {
  return [
    ...(options.model ? [MODEL_FLAGS[command], options.model] : []),
    ...(options.extraArgs ?? []),
  ];
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

function claudeSession(system: string, user: string, options: CliSessionOptions = {}): CliSession {
  let resultText: string | null = null;
  return {
    // Prompt arrives via stdin, so config-driven args can safely trail.
    args: [
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--system-prompt",
      system,
      ...optionArgs("claude", options),
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

/** Exported for unit tests. */
export function codexSession(
  system: string,
  user: string,
  options: CliSessionOptions = {},
): CliSession {
  // Tokens streamed to the UI are best-effort deltas (dedup by emitted
  // length per item id); the PERSISTED markdown always comes from the final
  // per-item text, so an item.completed that revises earlier partial text
  // wins over whatever was streamed.
  const emittedLength = new Map<string, number>();
  const finalTexts = new Map<string, string>();
  return {
    // Config-driven args must precede the "-" stdin sentinel.
    args: [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-s",
      "read-only",
      ...optionArgs("codex", options),
      "-",
    ],
    // codex exec has no separate system/instructions channel (verified
    // against --help): system + user share stdin, delimited explicitly. This
    // is a weaker injection boundary than claude's --system-prompt —
    // documented in the PR.
    stdinPayload: `<instructions>\n${system}\n</instructions>\n\n${user}`,
    handleLine(line) {
      const item = parseCodexStreamLine(line);
      if (item.kind === "message") {
        finalTexts.set(item.id, item.text);
        const previous = emittedLength.get(item.id) ?? 0;
        emittedLength.set(item.id, Math.max(previous, item.text.length));
        const token = item.text.slice(previous);
        return token ? { token } : {};
      }
      if (item.kind === "error") return { error: item.message };
      return {};
    },
    finalMarkdown: (accumulated) =>
      finalTexts.size ? [...finalTexts.values()].join("\n\n") : accumulated,
  };
}

/** Exported for unit tests. */
export function cursorSession(
  system: string,
  user: string,
  options: CliSessionOptions = {},
): CliSession {
  let resultText: string | null = null;
  return {
    // The prompt is positional in print mode (stdin is only read as extra
    // context, and only in some versions — argv is the documented channel).
    // cursor-agent has no system-prompt flag, so instructions share the
    // prompt, delimited like codex. Without --force, print mode never
    // modifies files. Config-driven args must precede the positional prompt.
    args: [
      "-p",
      "--output-format",
      "stream-json",
      ...optionArgs("cursor-agent", options),
      `<instructions>\n${system}\n</instructions>\n\n${user}`,
    ],
    stdinPayload: "",
    handleLine(line) {
      const item = parseCursorStreamLine(line);
      if (item.kind === "token") return { token: item.text };
      if (item.kind === "result") resultText = item.text;
      if (item.kind === "error") return { error: item.message };
      return {};
    },
    // The terminal result event is documented as the authoritative aggregated
    // text — assistant events are best-effort streaming.
    finalMarkdown: (accumulated) => resultText ?? accumulated,
  };
}

/** Exported for unit tests. */
export function grokSession(
  system: string,
  user: string,
  options: CliSessionOptions = {},
): CliSession {
  // grok's streaming-json event schema is not published, so this adapter
  // stays on plain output: stdout lines stream to the UI as-is and the
  // accumulated text is the document. --rules appends to the system prompt
  // (the documented instruction channel); the prompt itself is argv-only.
  return {
    args: [
      "-p",
      user,
      "--output-format",
      "plain",
      "--rules",
      system,
      "--no-auto-update",
      ...optionArgs("grok", options),
    ],
    stdinPayload: "",
    handleLine: (line) => ({ token: `${line}\n` }),
    finalMarkdown: (accumulated) => accumulated,
  };
}

const CLI_SESSIONS: Record<
  SupportedCliCommand,
  (system: string, user: string, options: CliSessionOptions) => CliSession
> = {
  claude: claudeSession,
  codex: codexSession,
  "cursor-agent": cursorSession,
  grok: grokSession,
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
  // Defense in depth: rows can predate action-boundary validation, and the
  // args reach a spawned process — re-check here and refuse to build.
  if (config.extraArgs) {
    const problem = validateExtraArgs(config.extraArgs);
    if (problem) throw new ProviderConfigError(problem);
  }

  async function* run(
    request: AgentRequest,
    mode: "draft" | "refine" | "summarize",
  ): AsyncIterable<AgentEvent> {
    let text = "";
    let errored = false;
    try {
      const session = CLI_SESSIONS[config.command](
        systemPrompt(request, config.systemPromptOverride),
        userPrompt(request, mode),
        { model: config.model, extraArgs: config.extraArgs },
      );
      const child = spawn(config.command, session.args, { stdio: ["pipe", "pipe", "pipe"] });
      // Attach both handlers synchronously: an unhandled ChildProcess "error"
      // (missing/broken binary) crashes the server, and "close" is not
      // guaranteed to fire when spawn itself fails.
      let spawnError: Error | null = null;
      const closed = new Promise<number | null>((resolve) => {
        child.once("close", resolve);
        child.once("error", (error) => {
          spawnError = error;
          resolve(null);
        });
      });
      const killTimer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdin.on("error", () => undefined); // EPIPE if the child dies first
      child.stdin.end(session.stdinPayload);

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_CAP); // bounded, keep the tail
      });

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

      const exitCode = await closed;
      clearTimeout(killTimer);

      if (errored) return;
      if (spawnError !== null) {
        const message = (spawnError as Error).message;
        yield { type: "error", message: `failed to run ${config.command}: ${message}` };
        return;
      }
      const exitFailure = exitFailureEvent(config.command, exitCode, stderr);
      if (exitFailure) {
        yield exitFailure;
        return;
      }
      const markdown = session.finalMarkdown(text);
      if (!markdown.trim()) {
        // Zero parseable output must not persist an empty version.
        yield { type: "error", message: `${config.command} produced no output` };
        return;
      }
      yield { type: "done", blocks: blocksFromMarkdown(markdown, request.blocks) };
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

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderConfigError } from "../src/factory.js";
import { parseClaudeStreamLine } from "../src/node/claude-stream.js";
import { parseCodexStreamLine } from "../src/node/codex-stream.js";
import { findExecutableOnPath } from "../src/node/detect.js";
import { createSpecAgentNode } from "../src/node/factory.js";
import { parseCursorStreamLine } from "../src/node/cursor-stream.js";
import {
  codexSession,
  createLocalCliAgent,
  cursorSession,
  grokSession,
  SUPPORTED_CLI_COMMANDS,
} from "../src/node/local-cli.js";

describe("parseClaudeStreamLine", () => {
  // Shapes recorded from a real `claude -p --output-format stream-json
  // --include-partial-messages --verbose` run on this machine.
  it("extracts text deltas from stream_event lines", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
    });
    expect(parseClaudeStreamLine(line)).toEqual({ kind: "token", text: "Hi" });
  });

  it("ignores system, init, and non-text events", () => {
    for (const line of [
      JSON.stringify({ type: "system", subtype: "init", tools: [] }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
      JSON.stringify({ type: "stream_event", event: { type: "message_start" } }),
      "not json at all",
    ]) {
      expect(parseClaudeStreamLine(line).kind).toBe("ignore");
    }
  });

  it("maps the final result line", () => {
    const ok = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "# Doc",
    });
    expect(parseClaudeStreamLine(ok)).toEqual({ kind: "result", text: "# Doc" });
    const bad = JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
    });
    expect(parseClaudeStreamLine(bad).kind).toBe("error");
  });
});

describe("parseCodexStreamLine", () => {
  // Shapes recorded from a real `codex exec --json --ephemeral -s read-only
  // --skip-git-repo-check` run on this machine.
  it("extracts completed agent messages", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "item_0", type: "agent_message", text: "hello" },
    });
    expect(parseCodexStreamLine(line)).toEqual({ kind: "message", id: "item_0", text: "hello" });
  });

  it("handles partial item.updated events with the same shape", () => {
    const line = JSON.stringify({
      type: "item.updated",
      item: { id: "item_0", type: "agent_message", text: "hel" },
    });
    expect(parseCodexStreamLine(line)).toEqual({ kind: "message", id: "item_0", text: "hel" });
  });

  it("ignores thread/turn bookkeeping, reasoning items, and noise", () => {
    for (const line of [
      JSON.stringify({ type: "thread.started", thread_id: "t" }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1 } }),
      JSON.stringify({ type: "item.completed", item: { id: "r", type: "reasoning", text: "x" } }),
      "not json at all",
    ]) {
      expect(parseCodexStreamLine(line).kind).toBe("ignore");
    }
  });

  it("maps turn.failed and error events to errors", () => {
    expect(
      parseCodexStreamLine(JSON.stringify({ type: "turn.failed", error: { message: "boom" } })),
    ).toEqual({ kind: "error", message: "boom" });
    expect(
      parseCodexStreamLine(JSON.stringify({ type: "error", message: "rate limited" })),
    ).toEqual({ kind: "error", message: "rate limited" });
    expect(parseCodexStreamLine(JSON.stringify({ type: "turn.failed" })).kind).toBe("error");
  });
});

describe("parseCursorStreamLine", () => {
  // Shapes per the documented cursor-agent stream-json format
  // (cursor.com/docs/cli/reference/output-format).
  it("extracts assistant text and joins multiple text parts", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Hel" },
          { type: "text", text: "lo" },
        ],
      },
      session_id: "s",
    });
    expect(parseCursorStreamLine(line)).toEqual({ kind: "token", text: "Hello" });
  });

  it("ignores system, user, tool_call events, and noise", () => {
    for (const line of [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "hi" }] } }),
      JSON.stringify({ type: "tool_call", subtype: "started" }),
      JSON.stringify({ type: "assistant", message: { content: [] } }),
      "not json at all",
    ]) {
      expect(parseCursorStreamLine(line).kind).toBe("ignore");
    }
  });

  it("maps the terminal result line", () => {
    const ok = JSON.stringify({ type: "result", subtype: "success", result: "# Doc" });
    expect(parseCursorStreamLine(ok)).toEqual({ kind: "result", text: "# Doc" });
    const bad = JSON.stringify({ type: "result", subtype: "error", error: { message: "boom" } });
    expect(parseCursorStreamLine(bad)).toEqual({ kind: "error", message: "boom" });
  });
});

describe("cursorSession", () => {
  it("prefers the authoritative result text over accumulated stream text", () => {
    const session = cursorSession("SYS", "USER");
    session.handleLine(
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "part" }] } }),
    );
    session.handleLine(JSON.stringify({ type: "result", subtype: "success", result: "# Final" }));
    expect(session.finalMarkdown("part")).toBe("# Final");
  });

  it("falls back to accumulated text when no result line arrived", () => {
    const session = cursorSession("SYS", "USER");
    expect(session.finalMarkdown("streamed")).toBe("streamed");
  });

  it("delimits the system prompt inside the positional prompt (no system flag exists)", () => {
    const session = cursorSession("SYS", "USER");
    const prompt = session.args[session.args.length - 1]!;
    expect(prompt.startsWith("<instructions>\nSYS\n</instructions>")).toBe(true);
    expect(prompt.endsWith("USER")).toBe(true);
    // Print mode without --force never modifies files — keep it that way.
    expect(session.args).not.toContain("--force");
  });
});

describe("grokSession", () => {
  it("streams plain stdout lines and keeps them as the document", () => {
    const session = grokSession("SYS", "USER");
    expect(session.handleLine("# Title")).toEqual({ token: "# Title\n" });
    expect(session.handleLine("")).toEqual({ token: "\n" });
    expect(session.finalMarkdown("# Title\n\nBody")).toBe("# Title\n\nBody");
  });

  it("passes the system prompt via --rules and the user prompt via -p", () => {
    const session = grokSession("SYS", "USER");
    expect(session.args[session.args.indexOf("-p") + 1]).toBe("USER");
    expect(session.args[session.args.indexOf("--rules") + 1]).toBe("SYS");
  });
});

describe("findExecutableOnPath", () => {
  it("finds an executable in a PATH-style var and misses non-executables", () => {
    const dir = mkdtempSync(join(tmpdir(), "specpasa-detect-"));
    const exe = join(dir, "fake-cli");
    writeFileSync(exe, "#!/bin/sh\n");
    chmodSync(exe, 0o755);
    writeFileSync(join(dir, "not-exec"), "");
    expect(findExecutableOnPath("fake-cli", dir)).toBe(exe);
    expect(findExecutableOnPath("not-exec", dir)).toBeNull();
    expect(findExecutableOnPath("absent", dir)).toBeNull();
  });
});

describe("codexSession", () => {
  const message = (id: string, text: string, type = "item.completed") =>
    JSON.stringify({ type, item: { id, type: "agent_message", text } });

  it("streams incremental tokens across item.updated/completed", () => {
    const session = codexSession("sys", "user");
    expect(session.handleLine(message("i0", "hel", "item.updated"))).toEqual({ token: "hel" });
    expect(session.handleLine(message("i0", "hello", "item.updated"))).toEqual({ token: "lo" });
    expect(session.handleLine(message("i0", "hello"))).toEqual({});
    expect(session.finalMarkdown("hello")).toBe("hello");
  });

  it("persists the final completed text even when it revises streamed partials", () => {
    const session = codexSession("sys", "user");
    session.handleLine(message("i0", "draft one", "item.updated"));
    session.handleLine(message("i0", "revised!"));
    // Streamed deltas may be stale; the done blocks must use the final text.
    expect(session.finalMarkdown("draft one")).toBe("revised!");
  });

  it("delimits the system prompt from user content on stdin", () => {
    const session = codexSession("SYS", "USER");
    expect(session.stdinPayload.startsWith("<instructions>\nSYS\n</instructions>")).toBe(true);
    expect(session.stdinPayload.endsWith("USER")).toBe(true);
  });
});

describe("createLocalCliAgent failure paths", () => {
  const request = { prompt: "x", blocks: [], phase: "prd" as const };

  it("surfaces a missing binary as an error event instead of crashing", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/nonexistent-dir";
    try {
      const agent = createLocalCliAgent({ command: "claude", timeoutMs: 5000 });
      const events = [];
      for await (const event of agent.draft(request)) events.push(event);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "error" });
      expect((events[0] as { message: string }).message).toContain("claude");
    } finally {
      process.env.PATH = originalPath;
    }
  });
});

describe("createSpecAgentNode", () => {
  const base = { model: null, baseUrl: null, apiKey: null };

  it("builds a local CLI agent for each allowlisted command", () => {
    for (const cliCommand of SUPPORTED_CLI_COMMANDS) {
      const agent = createSpecAgentNode({ ...base, kind: "local_cli", cliCommand });
      expect(agent.kind).toBe("local_cli");
      expect(agent.name).toContain(cliCommand);
    }
  });

  it("rejects commands outside the allowlist (no arbitrary spawn from db data)", () => {
    for (const cliCommand of ["rm", "sh", "", undefined]) {
      expect(() => createSpecAgentNode({ ...base, kind: "local_cli", cliCommand })).toThrow(
        ProviderConfigError,
      );
    }
  });

  it("delegates non-CLI kinds to the root factory", () => {
    const agent = createSpecAgentNode({ ...base, kind: "anthropic", apiKey: "sk-ant-x" });
    expect(agent.kind).toBe("anthropic");
  });

  it("refuses stored extraArgs that fail validation", () => {
    expect(() =>
      createSpecAgentNode({
        ...base,
        kind: "local_cli",
        cliCommand: "claude",
        settings: { extraArgs: [] },
      }),
    ).not.toThrow();
    expect(() =>
      createLocalCliAgent({ command: "claude", extraArgs: ["bad\narg"] }),
    ).toThrow(ProviderConfigError);
  });
});

describe("CLI session model flag and extra args placement", () => {
  const options = { model: "test-model", extraArgs: ["--custom-flag"] };

  it("codex: config args come before the '-' stdin sentinel", () => {
    const args = codexSession("sys", "user", options).args;
    expect(args.at(-1)).toBe("-");
    const modelAt = args.indexOf("--model");
    expect(modelAt).toBeGreaterThan(-1);
    expect(args[modelAt + 1]).toBe("test-model");
    expect(args.indexOf("--custom-flag")).toBeLessThan(args.indexOf("-"));
  });

  it("cursor-agent: config args come before the positional prompt", () => {
    const args = cursorSession("sys", "user", options).args;
    expect(args.at(-1)).toContain("user"); // positional prompt stays last
    expect(args.indexOf("--model")).toBeLessThan(args.length - 1);
    expect(args[args.indexOf("--model") + 1]).toBe("test-model");
    expect(args.indexOf("--custom-flag")).toBeLessThan(args.length - 1);
  });

  it("grok: config args append after the existing flags", () => {
    const args = grokSession("sys", "user", options).args;
    expect(args.indexOf("--model")).toBeGreaterThan(args.indexOf("--no-auto-update"));
    expect(args[args.indexOf("--model") + 1]).toBe("test-model");
    expect(args.at(-1)).toBe("--custom-flag");
  });

  it("omits the model flag and extra args entirely when unset", () => {
    for (const session of [codexSession, cursorSession, grokSession]) {
      const args = session("sys", "user").args;
      expect(args).not.toContain("--model");
      expect(args).not.toContain("--custom-flag");
    }
  });
});

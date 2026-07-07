import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderConfigError } from "../src/factory.js";
import { parseClaudeStreamLine } from "../src/node/claude-stream.js";
import { parseCodexStreamLine } from "../src/node/codex-stream.js";
import { findExecutableOnPath } from "../src/node/detect.js";
import { createSpecAgentNode } from "../src/node/factory.js";

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
    expect(parseCodexStreamLine(JSON.stringify({ type: "error", message: "rate limited" }))).toEqual(
      { kind: "error", message: "rate limited" },
    );
    expect(parseCodexStreamLine(JSON.stringify({ type: "turn.failed" })).kind).toBe("error");
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

describe("createSpecAgentNode", () => {
  const base = { model: null, baseUrl: null, apiKey: null };

  it("builds a local CLI agent for an allowlisted command", () => {
    const agent = createSpecAgentNode({ ...base, kind: "local_cli", cliCommand: "claude" });
    expect(agent.kind).toBe("local_cli");
    expect(agent.name).toContain("claude");
  });

  it("rejects commands outside the allowlist (no arbitrary spawn from db data)", () => {
    for (const cliCommand of ["rm", "codex", "", undefined]) {
      expect(() => createSpecAgentNode({ ...base, kind: "local_cli", cliCommand })).toThrow(
        ProviderConfigError,
      );
    }
  });

  it("delegates non-CLI kinds to the root factory", () => {
    const agent = createSpecAgentNode({ ...base, kind: "anthropic", apiKey: "sk-ant-x" });
    expect(agent.kind).toBe("anthropic");
  });
});

import { describe, expect, it } from "vitest";
import { createLocalCliAgent } from "../src/node/local-cli.js";

/**
 * Opt-in smoke against the REAL codex CLI (needs an authenticated install):
 *   CODEX_SMOKE=1 pnpm vitest run test/codex-smoke.test.ts
 * Kept out of the default suite — it spends real tokens and needs network.
 */
describe.skipIf(!process.env.CODEX_SMOKE)("codex CLI smoke", () => {
  it("drafts through the real codex binary", { timeout: 180_000 }, async () => {
    const agent = createLocalCliAgent({ command: "codex", timeoutMs: 150_000 });
    const events = [];
    for await (const event of agent.draft({
      prompt: "Reply with exactly one heading line: '# Smoke OK' and nothing else.",
      blocks: [],
      phase: "prd",
    })) {
      events.push(event);
    }
    const done = events.find((e) => e.type === "done");
    expect(done, JSON.stringify(events).slice(0, 500)).toBeDefined();
    expect(done && done.type === "done" ? done.blocks.length : 0).toBeGreaterThan(0);
  });
});

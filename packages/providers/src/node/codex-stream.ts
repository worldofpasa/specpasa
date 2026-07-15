/**
 * Parser for `codex exec --json` JSONL thread events. Pure (no Node imports)
 * so it is unit-testable and reusable.
 *
 * Relevant line shapes, recorded from a real run on this machine
 * (`codex exec --json --ephemeral -s read-only --skip-git-repo-check "..."`):
 * - {"type":"thread.started","thread_id":"..."}                      → ignore
 * - {"type":"turn.started"}                                          → ignore
 * - {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"..."}}
 * - {"type":"turn.completed","usage":{...}}                          → ignore
 *
 * Unlike claude's stream-json there are no token deltas by default: the
 * agent message arrives complete. `item.updated` (partial text for the same
 * item id) is handled defensively with the same shape; the adapter dedups by
 * emitted length per item id. `turn.failed` / `error` events map to errors.
 */

export type CodexStreamItem =
  | { kind: "message"; id: string; text: string }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

interface CodexLine {
  type?: string;
  message?: string;
  error?: { message?: string } | string;
  item?: { id?: string; type?: string; text?: string };
}

const IGNORE: CodexStreamItem = { kind: "ignore" };

function errorMessage(parsed: CodexLine): string {
  if (typeof parsed.error === "string") return parsed.error;
  return parsed.error?.message ?? parsed.message ?? "codex reported an error";
}

export function parseCodexStreamLine(line: string): CodexStreamItem {
  let parsed: CodexLine;
  try {
    parsed = JSON.parse(line) as CodexLine;
  } catch {
    return IGNORE; // non-JSON noise on stdout
  }
  const isItemEvent = parsed.type === "item.completed" || parsed.type === "item.updated";
  if (
    isItemEvent &&
    parsed.item?.type === "agent_message" &&
    typeof parsed.item.text === "string"
  ) {
    return { kind: "message", id: parsed.item.id ?? "item", text: parsed.item.text };
  }
  if (parsed.type === "turn.failed" || parsed.type === "error") {
    return { kind: "error", message: errorMessage(parsed) };
  }
  return IGNORE;
}

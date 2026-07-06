/**
 * Parser for `claude -p --output-format stream-json --include-partial-messages`
 * ndjson lines. Pure (no Node imports) so it is unit-testable and reusable.
 *
 * Relevant line shapes (all others are ignored):
 * - {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}}
 * - {"type":"result","subtype":"success","is_error":false,"result":"<full text>"}
 * - {"type":"result","subtype":"...", "is_error":true, ...} on failure
 */

export type ClaudeStreamItem =
  | { kind: "token"; text: string }
  | { kind: "result"; text: string }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

interface ClaudeLine {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  error?: { message?: string };
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
}

const IGNORE: ClaudeStreamItem = { kind: "ignore" };

function fromStreamEvent(parsed: ClaudeLine): ClaudeStreamItem {
  const delta = parsed.event?.delta;
  if (parsed.event?.type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
    return { kind: "token", text: delta.text };
  }
  return IGNORE;
}

function fromResult(parsed: ClaudeLine): ClaudeStreamItem {
  if (!parsed.is_error) return { kind: "result", text: parsed.result ?? "" };
  return {
    kind: "error",
    message:
      parsed.result ||
      parsed.error?.message ||
      `claude exited with ${parsed.subtype ?? "an error"}`,
  };
}

export function parseClaudeStreamLine(line: string): ClaudeStreamItem {
  let parsed: ClaudeLine;
  try {
    parsed = JSON.parse(line) as ClaudeLine;
  } catch {
    return IGNORE; // non-JSON noise (warnings, etc.)
  }
  if (parsed.type === "stream_event") return fromStreamEvent(parsed);
  if (parsed.type === "result") return fromResult(parsed);
  return IGNORE;
}

/**
 * Parser for `cursor-agent -p --output-format stream-json` ndjson lines.
 * Pure (no Node imports) so it is unit-testable and reusable.
 *
 * Relevant line shapes, per the documented headless stream format
 * (cursor.com/docs/cli/reference/output-format — written from docs, not a
 * recorded run; the terminal result line is documented as authoritative):
 * - {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]},"session_id":"..."}
 * - {"type":"result","subtype":"success","result":"<full aggregated text>","session_id":"..."}
 * - {"type":"result","subtype":"<failure>",...} on failure
 * All other event types (system/user/tool_call) are ignored.
 */

export type CursorStreamItem =
  | { kind: "token"; text: string }
  | { kind: "result"; text: string }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

interface CursorLine {
  type?: string;
  subtype?: string;
  result?: string;
  error?: { message?: string } | string;
  message?: { content?: { type?: string; text?: string }[] };
}

const IGNORE: CursorStreamItem = { kind: "ignore" };

function fromAssistant(parsed: CursorLine): CursorStreamItem {
  const text = (parsed.message?.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return text ? { kind: "token", text } : IGNORE;
}

function fromResult(parsed: CursorLine): CursorStreamItem {
  if (parsed.subtype === "success") return { kind: "result", text: parsed.result ?? "" };
  const message =
    (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ??
    parsed.result ??
    `cursor-agent exited with ${parsed.subtype ?? "an error"}`;
  return { kind: "error", message };
}

export function parseCursorStreamLine(line: string): CursorStreamItem {
  let parsed: CursorLine;
  try {
    parsed = JSON.parse(line) as CursorLine;
  } catch {
    return IGNORE; // non-JSON noise on stdout
  }
  if (parsed.type === "assistant") return fromAssistant(parsed);
  if (parsed.type === "result") return fromResult(parsed);
  return IGNORE;
}

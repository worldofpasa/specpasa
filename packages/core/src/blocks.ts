import { ulid } from "ulid";
import { type BlockType, type SpecBlock } from "./types.js";

interface Segment {
  type: BlockType;
  markdown: string;
}

/**
 * Split markdown into block segments: blank-line-separated chunks, with
 * fenced code blocks kept whole. A ```mermaid fence becomes a mermaid block
 * (FR-DIAG-1); everything else is a markdown block.
 */
export function splitMarkdown(markdown: string): Segment[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const segments: Segment[] = [];
  let current: string[] = [];
  let currentType: BlockType = "markdown";
  let openFence: string | null = null;

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) segments.push({ type: currentType, markdown: text });
    current = [];
    currentType = "markdown";
  };

  for (const line of lines) {
    const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(line.trimEnd());
    if (openFence) {
      current.push(line);
      if (fenceMatch && fenceMatch[1]!.startsWith(openFence[0]!) && !fenceMatch[2]!.trim()) {
        openFence = null;
        flush();
      }
      continue;
    }
    if (fenceMatch) {
      flush();
      openFence = fenceMatch[1]!;
      currentType = fenceMatch[2]!.trim().toLowerCase() === "mermaid" ? "mermaid" : "markdown";
      current.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return segments;
}

/**
 * Turn markdown into blocks, preserving block IDs from a previous version
 * wherever content is unchanged (ADR-5). Unchanged blocks keep their ULID so
 * comment threads anchored to them survive the new version; new or edited
 * content gets a fresh ULID.
 */
export function blocksFromMarkdown(markdown: string, previous: SpecBlock[] = []): SpecBlock[] {
  const unused = [...previous];
  return splitMarkdown(markdown).map((segment) => {
    const index = unused.findIndex((b) => b.markdown === segment.markdown);
    if (index >= 0) {
      const [match] = unused.splice(index, 1);
      return { ...segment, block_id: match!.block_id };
    }
    return { ...segment, block_id: ulid() };
  });
}

export function blocksToMarkdown(blocks: SpecBlock[]): string {
  return blocks.map((b) => b.markdown).join("\n\n");
}

/**
 * Inner source of a fenced block ("```mermaid\n…\n```" → "…"). Returns the
 * input unchanged when it is not a single fenced block.
 */
export function fencedContent(markdown: string): string {
  const lines = markdown.trim().split("\n");
  const first = lines[0] ?? "";
  const last = lines[lines.length - 1] ?? "";
  if (lines.length >= 2 && /^(`{3,}|~{3,})/.test(first) && /^(`{3,}|~{3,})\s*$/.test(last)) {
    return lines.slice(1, -1).join("\n");
  }
  return markdown;
}

import { describe, expect, it } from "vitest";
import { blocksFromMarkdown, blocksToMarkdown, splitMarkdown } from "../src/blocks.js";
import { diffBlocks } from "../src/diff.js";

const DOC = `# Title

First paragraph.

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

Last paragraph.`;

describe("splitMarkdown", () => {
  it("splits on blank lines and keeps fences whole", () => {
    const segments = splitMarkdown(DOC);
    expect(segments.map((s) => s.type)).toEqual(["markdown", "markdown", "mermaid", "markdown"]);
    expect(segments[2]!.markdown).toContain("graph TD");
  });

  it("does not split on blank lines inside a fence", () => {
    const segments = splitMarkdown("```js\na\n\nb\n```");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.type).toBe("markdown");
  });
});

describe("blocksFromMarkdown", () => {
  it("round-trips through blocksToMarkdown", () => {
    const blocks = blocksFromMarkdown(DOC);
    expect(blocksToMarkdown(blocks)).toBe(DOC);
  });

  it("keeps block IDs stable for unchanged content across versions", () => {
    const v1 = blocksFromMarkdown(DOC);
    const v2 = blocksFromMarkdown(DOC.replace("First paragraph.", "Edited paragraph."), v1);
    expect(v2[0]!.block_id).toBe(v1[0]!.block_id); // title unchanged
    expect(v2[2]!.block_id).toBe(v1[2]!.block_id); // mermaid unchanged
    expect(v2[1]!.block_id).not.toBe(v1[1]!.block_id); // edited → new identity
  });

  it("assigns unique IDs to identical duplicate blocks", () => {
    const blocks = blocksFromMarkdown("same\n\nsame");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.block_id).not.toBe(blocks[1]!.block_id);
  });
});

describe("diffBlocks", () => {
  it("classifies added, removed, changed, and unchanged blocks", () => {
    const v1 = blocksFromMarkdown("keep\n\nedit me\n\ndrop");
    const v2 = blocksFromMarkdown("keep\n\nedited\n\nnew block", v1);
    const diff = diffBlocks(v1, v2);
    expect(diff.unchanged.map((b) => b.markdown)).toEqual(["keep"]);
    expect(diff.removed.map((b) => b.markdown)).toEqual(["edit me", "drop"]);
    expect(diff.added.map((b) => b.markdown)).toEqual(["edited", "new block"]);
    expect(diff.changed).toEqual([]);
  });
});

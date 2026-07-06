import { type SpecBlock } from "./types.js";

export interface BlockChange {
  before: SpecBlock;
  after: SpecBlock;
}

export interface BlockDiff {
  added: SpecBlock[];
  removed: SpecBlock[];
  changed: BlockChange[];
  unchanged: SpecBlock[];
}

/** Block-level diff between two versions, matched by stable block_id (FR-LIFE-6). */
export function diffBlocks(before: SpecBlock[], after: SpecBlock[]): BlockDiff {
  const beforeById = new Map(before.map((b) => [b.block_id, b]));
  const afterIds = new Set(after.map((b) => b.block_id));

  const diff: BlockDiff = { added: [], removed: [], changed: [], unchanged: [] };
  for (const block of after) {
    const prior = beforeById.get(block.block_id);
    if (!prior) diff.added.push(block);
    else if (prior.markdown !== block.markdown) diff.changed.push({ before: prior, after: block });
    else diff.unchanged.push(block);
  }
  diff.removed = before.filter((b) => !afterIds.has(b.block_id));
  return diff;
}

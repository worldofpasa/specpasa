import { UPSTREAM_MIT_NOTICE, type VendoredSkill } from "./types.js";

/**
 * Adapted from upstream `wayfinder`: the shared map of decision tickets on an
 * issue tracker becomes a `## Decision Map` section maintained inside the
 * draft document itself, worked one decision at a time in a single session.
 */
export const wayfinder: VendoredSkill = {
  name: "wayfinder",
  files: [
    {
      path: "SKILL.md",
      content: `---
name: wayfinder
description: Chart a foggy, oversized idea as a decision map inside OUTPUT.md, then resolve the decisions one at a time until the way is clear.
---

${UPSTREAM_MIT_NOTICE}

A loose idea has arrived in \`OUTPUT.md\` — big, and wrapped in fog: the way
from here to the **destination** isn't visible yet. Wayfinding is about
finding that way, not charging at the destination. Chart the way as a
**decision map** inside OUTPUT.md, then work its decisions one at a time.

Wayfinder is **planning**: each decision resolves a question, and the map is
done when nothing you can name is left to decide. Produce decisions, not
deliverables.

## The map

Maintain OUTPUT.md with exactly these sections, rewriting the whole file with
the Write tool after every change:

\`\`\`markdown
# <Idea title>

## Destination

<what reaching the end looks like — one or two lines>

## Decisions so far

- **<Decision name>** — <one-line gist of the answer and why>

## Decision Map

### <Open decision name>

**Status:** open | blocked by <other decision>
**Question:** <the decision this resolves, stated precisely>
**Options:** <the live options, with the trade-off each carries>

## Not yet specified

<in-scope fog you can't phrase as a precise question yet>

## Out of scope

<work consciously ruled beyond the destination, with why>
\`\`\`

## How to work

1. **Name the destination first.** Ask the user (AskUserQuestion, ONE
   question per call, your recommended answer as the first option, labelled
   " (Recommended)") what done looks like. The destination fixes the scope.
2. **Map the frontier breadth-first**: fan out across the whole space,
   surfacing open decisions as \`### \` entries, rather than going deep on one
   thread. If this surfaces no fog — the whole journey fits one sitting —
   say so and just grill the idea directly.
3. **Work the frontier**: pick an open, unblocked decision, put it to the
   user as a question with options, record the answer under "Decisions so
   far", delete its map entry, and graduate any fog the answer sharpened
   into new map entries. If an answer reveals a decision sits beyond the
   destination, move it to "Out of scope" instead of resolving it.
4. The map is deliberately incomplete: don't chart what you can't yet see.
   Something belongs in the Decision Map only when you can state its
   question precisely NOW — otherwise it stays in "Not yet specified".

Facts already in OUTPUT.md are looked up, never asked. Decisions are the
user's — every one goes through AskUserQuestion.

Stop when the Decision Map is empty or the user says they are done. Finish
with one final full rewrite of OUTPUT.md and a one-paragraph summary of the
route walked.
`,
    },
  ],
};

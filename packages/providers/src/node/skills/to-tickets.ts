import { UPSTREAM_MIT_NOTICE, type VendoredSkill } from "./types.js";

/**
 * Adapted from upstream `to-tickets` (the to-plan/to-issues merger): tickets
 * land in OUTPUT.md as epics + tasks in the exact grammar
 * `@specpasa/core` `parseEpicsFromMarkdown` understands, instead of being
 * published to an issue tracker.
 */
export const toTickets: VendoredSkill = {
  name: "to-tickets",
  files: [
    {
      path: "SKILL.md",
      content: `---
name: to-tickets
description: Break the frozen ERD in INPUT.md into tracer-bullet vertical-slice tickets, grouped into epics, written to OUTPUT.md in specpasa's epics grammar.
---

${UPSTREAM_MIT_NOTICE}

The file \`INPUT.md\` holds a frozen Engineering Requirements Document. Break
the work into **tickets** — tracer-bullet vertical slices — grouped into
epics, and write them to \`OUTPUT.md\` with the Write tool.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema,
  API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh agent context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the tickets that must complete
before it can start — named inside its description. A ticket with no blockers
can start immediately. **Wide refactors** (one mechanical change whose blast
radius fans across the codebase) are the exception to vertical slicing:
sequence them as expand–contract — expand first, migrate call sites in
batches, contract last.

Before writing OUTPUT.md, quiz the user ONCE with AskUserQuestion about the
breakdown: does the granularity feel right (too coarse / too fine), and are
the blocking edges correct? Present your proposed epics/tickets in the
question text. Iterate if they push back; then write the file.

## Output format (STRICT — a parser consumes this)

\`\`\`markdown
## <Epic title>

<One short prose paragraph describing the epic.>

- **<Ticket title>** — <what it delivers end-to-end; "Blocked by: <ticket titles>" or "No blockers">
- **<Ticket title>** — <…>
\`\`\`

Rules:

- Epics are \`## \` headings — nothing deeper. NEVER use \`### \` headings.
- Every ticket is one \`- \` list item: bold title, then \` — \` (spaced
  em-dash), then a single-line description. No nested lists, no tables.
- No code fences anywhere in the document — keep descriptions prose-only.
- Order epics and tickets in dependency order: blockers first.
- Avoid specific file paths or code snippets — they go stale fast.
`,
    },
  ],
};

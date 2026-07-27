import { type VendoredSkill } from "./types.js";

/**
 * specpasa-original (no upstream equivalent): turns a frozen PRD into an
 * Engineering Requirements Document in the house style of
 * docs/domain-model.md — prose architecture, a mermaid erDiagram, per-entity
 * descriptions, and decisions with trade-offs.
 */
export const toErd: VendoredSkill = {
  name: "to-erd",
  files: [
    {
      path: "SKILL.md",
      content: `---
name: to-erd
description: Synthesize the frozen PRD in INPUT.md into an Engineering Requirements Document in OUTPUT.md — architecture, data model with a mermaid erDiagram, and decisions with trade-offs.
---

The file \`INPUT.md\` holds a frozen PRD. Derive the Engineering Requirements
Document from it and write it to \`OUTPUT.md\` with the Write tool.

Do NOT interview the user — synthesize from INPUT.md. The one exception: if
an engineering decision the data model hinges on is genuinely unresolved in
the PRD, ask about it with AskUserQuestion (at most two questions, one per
call, your recommended answer first and labelled " (Recommended)").

Structure OUTPUT.md as:

## Architecture

How the system fits together to satisfy the PRD: the components, their
responsibilities, and the boundaries between them. Prose first; add a mermaid
\`flowchart\` or \`sequenceDiagram\` fence only where it clarifies structure.

## Data Model

A single \`\`\`mermaid erDiagram\`\`\` fence covering every entity the PRD
implies: typed columns, and PK / FK / UK annotations. Follow the diagram with
one short subsection per entity describing what it is, its lifecycle, and any
invariants (immutability, uniqueness, ordering) the requirements impose.

## Key Decisions

Each significant engineering decision as its own entry: the decision, the
alternatives weighed, and the trade-off that settled it. Derive these from
the PRD's implementation decisions where they exist; make the engineering
consequences explicit.

## Open Questions

Engineering unknowns the PRD cannot answer — carry them forward honestly
rather than inventing answers.

Ground every entity and decision in a requirement from INPUT.md; do not
introduce features the PRD doesn't ask for.
`,
    },
  ],
};

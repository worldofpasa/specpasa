import { UPSTREAM_MIT_NOTICE, type VendoredSkill } from "./types.js";

/**
 * Adapted from upstream `to-spec` (formerly `to-prd`): reads the frozen idea
 * draft from INPUT.md and writes the PRD to OUTPUT.md instead of exploring a
 * repo and publishing to an issue tracker.
 */
export const toSpec: VendoredSkill = {
  name: "to-spec",
  files: [
    {
      path: "SKILL.md",
      content: `---
name: to-spec
description: Synthesize the frozen idea draft in INPUT.md into a PRD in OUTPUT.md — no interview, just synthesis of what was already decided.
---

${UPSTREAM_MIT_NOTICE}

The file \`INPUT.md\` holds a frozen idea draft: a problem, the decisions made
while sharpening it, and its remaining open questions. Turn it into a spec
(you may know this document as a PRD) and write it to \`OUTPUT.md\` with the
Write tool.

Do NOT interview the user — just synthesize what INPUT.md already holds. The
one exception: if a decision essential to the spec is genuinely unresolved in
INPUT.md, ask about it with AskUserQuestion (at most two questions, one per
call, your recommended answer first and labelled " (Recommended)").

Write OUTPUT.md using exactly this template:

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories, each in the format:

1. As an <actor>, I want a <feature>, so that <benefit>

This list should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made: the modules that will be
built/modified, their interfaces, technical clarifications, architectural
decisions, schema changes, API contracts, specific interactions. Do NOT
include specific file paths or code snippets — they go stale fast.

## Testing Decisions

What makes a good test here (only test external behavior, not implementation
details), which modules will be tested, and prior art for the tests.

## Out of Scope

The things that are out of scope for this spec. Anything INPUT.md ruled out
of scope stays out of scope here.

## Further Notes

Any further notes about the feature, including open questions INPUT.md left
unresolved — carry them forward honestly rather than inventing answers.
`,
    },
  ],
};

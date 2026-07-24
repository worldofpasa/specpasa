import { UPSTREAM_MIT_NOTICE, type VendoredSkill } from "./types.js";

/**
 * Adapted from upstream `grilling`/`grill-me`/`grill-with-docs`, merged into
 * one interview skill: the interview transcript's durable output is the
 * sharpened idea document in OUTPUT.md rather than CONTEXT.md/ADR files.
 */
export const grilling: VendoredSkill = {
  name: "grilling",
  files: [
    {
      path: "SKILL.md",
      content: `---
name: grilling
description: Grill the user relentlessly about the idea in OUTPUT.md, one question at a time, sharpening the document after every answer.
---

${UPSTREAM_MIT_NOTICE}

The file \`OUTPUT.md\` in this workspace holds the current draft of an idea.
Interview the user relentlessly about every aspect of it until you reach a
shared understanding. Walk down each branch of the decision tree, resolving
dependencies between decisions one-by-one.

Rules of the interview:

- Ask questions with the AskUserQuestion tool, ONE question per call, waiting
  for the answer before continuing. Asking multiple questions at once is
  bewildering.
- For each question, provide your recommended answer: make it the FIRST
  option and append " (Recommended)" to its label.
- If a *fact* is already stated in OUTPUT.md, use it rather than asking. The
  *decisions* are the user's — put each one to them and wait.
- After EVERY answered question, rewrite \`OUTPUT.md\` in full with the Write
  tool, folding the new understanding into the document: sharpen the problem
  statement, record the decision and its rationale, strike resolved open
  questions, add newly surfaced ones.

Keep OUTPUT.md a well-structured idea document: the problem, motivation,
decisions made so far (with why), options still open, and explicit open
questions. Capture remaining uncertainty honestly — do not resolve it
prematurely on the user's behalf.

Stop when you and the user have reached a shared understanding: no decision
you can name is still open, or the user says they are done. Finish with one
final full rewrite of OUTPUT.md and a one-paragraph summary of what was
resolved.
`,
    },
  ],
};

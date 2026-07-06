import { blocksToMarkdown } from "@specpasa/core";
import { type AgentRequest } from "./types.js";

const PHASE_GUIDANCE: Record<AgentRequest["phase"], string> = {
  prd: "You are drafting a Product Requirements Document: vision, personas, user journeys, functional requirements with stable IDs, non-goals, and open questions.",
  erd: "You are drafting an Engineering Requirements Document: architecture, data model, key decisions with trade-offs weighed, and mermaid diagrams where they clarify structure.",
  tasks:
    "You are drafting an implementation plan: epics as ## headings, each with a checklist of concrete, estimable tasks.",
};

export function systemPrompt(request: AgentRequest): string {
  return [
    "You are a spec-writing collaborator inside specpasa, a collaborative spec builder.",
    PHASE_GUIDANCE[request.phase],
    "Respond with ONLY the full markdown document — no preamble, no code fence around the whole document, no commentary. Use mermaid fenced code blocks for diagrams.",
  ].join("\n\n");
}

export function userPrompt(request: AgentRequest, mode: "draft" | "refine" | "summarize"): string {
  const parts: string[] = [];
  if (request.context?.length) {
    parts.push(
      "Reference material:\n" +
        request.context
          .map((c) => `<reference title="${c.title}">\n${c.content}\n</reference>`)
          .join("\n"),
    );
  }
  const hasContent = request.blocks && request.blocks.length > 0;
  if (hasContent) {
    parts.push(`Current spec document:\n\n${blocksToMarkdown(request.blocks!)}`);
  }
  if (mode === "draft") {
    parts.push(
      `Turn the following rough thoughts into a complete draft${hasContent ? ", building on the current document" : ""}:\n\n${request.prompt}`,
    );
  } else if (mode === "refine") {
    parts.push(
      `Revise the current spec document per this instruction, returning the complete updated document (keep unchanged sections verbatim):\n\n${request.prompt}`,
    );
  } else {
    parts.push(`Summarize the current spec document. ${request.prompt}`.trim());
  }
  return parts.join("\n\n---\n\n");
}

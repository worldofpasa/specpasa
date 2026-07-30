import { describe, expect, it } from "vitest";
import { SPEC_PHASES } from "@specpasa/core";
import { systemPrompt } from "../src/prompts.js";

describe("systemPrompt", () => {
  it("has phase guidance for every phase, including draft", () => {
    for (const phase of SPEC_PHASES) {
      const prompt = systemPrompt({ prompt: "x", phase });
      expect(prompt).toContain("You are drafting");
      expect(prompt).toContain("ONLY the full markdown document");
    }
    expect(systemPrompt({ prompt: "x", phase: "draft" })).toContain("idea document");
  });

  it("appends a workspace override after the base prompt, never replacing it", () => {
    const request = { prompt: "x", phase: "prd" } as const;
    const composed = systemPrompt(request, "Prefer terse bullet points.");
    expect(composed.startsWith(systemPrompt(request))).toBe(true);
    expect(composed).toContain("ONLY the full markdown document"); // output contract intact
    expect(composed).toContain(
      "<workspace-instructions>\nPrefer terse bullet points.\n</workspace-instructions>",
    );
  });

  it("leaves the prompt unchanged for empty or whitespace overrides", () => {
    const request = { prompt: "x", phase: "prd" } as const;
    expect(systemPrompt(request, undefined)).toBe(systemPrompt(request));
    expect(systemPrompt(request, "   ")).toBe(systemPrompt(request));
  });
});

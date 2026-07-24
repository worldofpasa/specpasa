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
});

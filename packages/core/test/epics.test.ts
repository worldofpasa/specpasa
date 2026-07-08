import { describe, expect, it } from "vitest";
import { parseEpicsFromMarkdown } from "../src/epics.js";

const DOC = `# Onboarding — Implementation Plan

Intro paragraph, not an epic.

## Signup flow

Everything to get a user registered.

- [ ] **Email form** — with validation
- [ ] SSO buttons
- Password reset

## Guided checklist

- [x] Checklist model

## Notes

No tasks here, just prose.

\`\`\`
## not-an-epic (inside fence)
- not a task
\`\`\`
`;

describe("parseEpicsFromMarkdown", () => {
  it("parses ## headings into epics with their tasks", () => {
    const epics = parseEpicsFromMarkdown(DOC);
    expect(epics.map((e) => e.title)).toEqual(["Signup flow", "Guided checklist", "Notes"]);
    expect(epics[0]!.description).toBe("Everything to get a user registered.");
    expect(epics[0]!.tasks).toEqual([
      { title: "Email form", description: "with validation" },
      { title: "SSO buttons", description: null },
      { title: "Password reset", description: null },
    ]);
    expect(epics[1]!.tasks).toHaveLength(1);
  });

  it("keeps taskless epics with prose so the UI can drop them explicitly", () => {
    const epics = parseEpicsFromMarkdown(DOC);
    expect(epics[2]).toMatchObject({ title: "Notes", tasks: [] });
    expect(epics[2]!.description).toContain("just prose");
  });

  it("ignores headings and list items inside code fences", () => {
    const epics = parseEpicsFromMarkdown(DOC);
    expect(epics.some((e) => e.title.includes("not-an-epic"))).toBe(false);
    expect(epics[2]!.tasks).toHaveLength(0);
  });

  it("returns empty for a doc with no ## headings", () => {
    expect(parseEpicsFromMarkdown("# Title\n\njust text")).toEqual([]);
  });
});

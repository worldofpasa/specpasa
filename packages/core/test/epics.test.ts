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

  // Format contract for the vendored to-tickets skill (AI erd→tasks
  // conversion): a representative OUTPUT.md must parse into ready-to-export
  // epics. If this shape changes, update the skill text in
  // packages/providers/src/node/skills/to-tickets.ts alongside it.
  it("parses a representative to-tickets conversion output", () => {
    const OUTPUT = `## Draft phase foundation

Everything to make the draft phase exist end-to-end.

- **Add draft to spec phases** — schema enum, lifecycle, and phase badge; No blockers
- **Start-phase picker on spec creation** — radio in the new-spec modal; Blocked by: Add draft to spec phases

## Interview panel

One vertical slice per surface.

- **Interview streaming route** — ndjson session stream with question events; No blockers
- **Question cards in the panel** — options, multi-select, free-text other; Blocked by: Interview streaming route
`;
    const epics = parseEpicsFromMarkdown(OUTPUT);
    expect(epics.map((e) => e.title)).toEqual(["Draft phase foundation", "Interview panel"]);
    expect(epics[0]!.description).toBe("Everything to make the draft phase exist end-to-end.");
    expect(epics[0]!.tasks).toEqual([
      {
        title: "Add draft to spec phases",
        description: "schema enum, lifecycle, and phase badge; No blockers",
      },
      {
        title: "Start-phase picker on spec creation",
        description: "radio in the new-spec modal; Blocked by: Add draft to spec phases",
      },
    ]);
    expect(epics.every((epic) => epic.tasks.length > 0)).toBe(true);
  });
});

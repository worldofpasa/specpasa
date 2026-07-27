import { describe, expect, it } from "vitest";
import { CONVERSION_SKILLS, INTERVIEW_SKILLS } from "../src/node/agent-session.js";
import { UPSTREAM_MIT_NOTICE, VENDORED_SKILLS } from "../src/node/skills/index.js";

const ADAPTED_FROM_UPSTREAM = ["grilling", "wayfinder", "to-spec", "to-tickets"] as const;

describe("vendored skills", () => {
  it("every skill leads with a SKILL.md whose name matches its directory", () => {
    for (const [name, skill] of Object.entries(VENDORED_SKILLS)) {
      expect(skill.name).toBe(name);
      expect(skill.files[0]!.path).toBe("SKILL.md");
      expect(skill.files[0]!.content).toContain(`name: ${name}`);
    }
  });

  it("skills adapted from mattpocock/skills carry the MIT notice", () => {
    for (const name of ADAPTED_FROM_UPSTREAM) {
      expect(VENDORED_SKILLS[name].files[0]!.content).toContain(UPSTREAM_MIT_NOTICE);
    }
    // to-erd is specpasa-original — no upstream notice.
    expect(VENDORED_SKILLS["to-erd"].files[0]!.content).not.toContain(UPSTREAM_MIT_NOTICE);
  });

  it("every interview and conversion skill is vendored", () => {
    for (const name of INTERVIEW_SKILLS) expect(VENDORED_SKILLS[name]).toBeDefined();
    for (const name of Object.values(CONVERSION_SKILLS)) {
      expect(VENDORED_SKILLS[name]).toBeDefined();
    }
  });

  it("to-tickets pins the parseEpicsFromMarkdown grammar", () => {
    const content = VENDORED_SKILLS["to-tickets"].files[0]!.content;
    expect(content).toContain("## <Epic title>");
    expect(content).toContain("**<Ticket title>** — ");
    expect(content).toContain("NEVER use `### ` headings");
  });

  it("conversion skills read INPUT.md and write OUTPUT.md", () => {
    for (const name of Object.values(CONVERSION_SKILLS)) {
      const content = VENDORED_SKILLS[name].files[0]!.content;
      expect(content).toContain("INPUT.md");
      expect(content).toContain("OUTPUT.md");
    }
  });
});

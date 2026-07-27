/** A skill seeded into an agent-session workspace (see ../agent-session.ts). */
export interface VendoredSkill {
  /** Directory name under `.claude/skills/` — also the `/slash` invocation. */
  name: string;
  /** Files written into `.claude/skills/<name>/`; `SKILL.md` first. */
  files: { path: string; content: string }[];
}

/**
 * MIT notice for skills adapted from mattpocock/skills — see
 * packages/providers/skills/{LICENSE,README.md} for the full text and the
 * list of adaptations.
 */
export const UPSTREAM_MIT_NOTICE =
  "<!-- Adapted from mattpocock/skills (MIT). Copyright (c) 2026 Matt Pocock. See packages/providers/skills/LICENSE. -->";

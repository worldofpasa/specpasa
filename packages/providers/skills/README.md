# Vendored agent skills

The interview and phase-conversion skills that specpasa seeds into each agent
session workspace (see `../src/node/skills/`). Skills ship as TypeScript string
constants — not loose files — because `@specpasa/providers` is consumed as raw
TS and bundled by Vite (no runtime file reads from the package directory).

## Provenance

`grilling`, `wayfinder`, `to-spec`, and `to-tickets` are adapted from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT, see `LICENSE`),
upstream commit `9603c1cc8118d08bc1b3bf34cf714f62178dea3b`. `to-erd` is
specpasa-original — upstream has no ERD skill.

Adaptations, common to all four:

- Upstream publishes to an issue tracker configured by
  `/setup-matt-pocock-skills`; specpasa's versions read the current document
  from `INPUT.md`/`OUTPUT.md` in the session workspace and write the result to
  `OUTPUT.md`, which the agent bridge persists into the spec.
- Tracker-specific machinery (labels, claiming, child issues, `/implement`
  hand-off) is removed; `wayfinder`'s shared map becomes a `## Decision Map`
  markdown section maintained inside the draft document itself.
- `to-tickets`' output format is pinned to the grammar
  `@specpasa/core` `parseEpicsFromMarkdown` understands
  (`## Epic` headings, `- **Title** — description` tasks).

Each adapted SKILL.md opens with an MIT notice comment crediting upstream.

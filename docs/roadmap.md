# specpasa — Roadmap

Milestones M0–M5. Requirement IDs reference [prd.md](./prd.md).

---

## M0 — Scaffold

**Goal:** A compiling, testable monorepo skeleton that encodes the architecture decisions — no user-facing features.

- pnpm monorepo: `apps/web` (Astro 7 + React islands), `packages/core`, `packages/db`, `packages/providers`
- Drizzle schema for the full domain model; initial SQLite migration; Postgres config present
- Phase/status state machine in `@specpasa/core` with unit tests (encodes FR-LIFE-1..5 rules)
- Dockerfile + docker-compose (SQLite default, Postgres profile) (NFR-1, NFR-2)
- CI basics: install, typecheck, lint, test

**Done when:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass; `pnpm db:generate` yields a migration that applies to a local libsql file; Astro dev server boots; `docker build` succeeds.

## M1 — Single-user vertical slice

**Goal:** One person can go from blank spec to an AI-drafted, versioned PRD.

- First-run admin setup + session auth (FR-TEN-6)
- CRUD: Project → Intent → Spec (FR-HIER-1..2)
- Markdown block editor island; every save = immutable SpecVersion with block IDs (FR-HIER-3..5)
- Version history browser with diffs (FR-LIFE-6)
- `SpecAgent` interface + two adapters: one cloud provider (Anthropic) and Ollama (FR-AI-1, FR-AI-3, FR-AI-4 partial)
- Streaming AI draft/refactor into the editor; `ai_generated` flag (FR-AI-7)
- Encrypted provider config, workspace + user scope (FR-AI-6)

**Done when:** A user can create a project/intent/spec, seed rough thoughts, generate an AI draft, edit it, and browse version diffs — on SQLite and on Postgres.

## M2 — Collaboration

**Goal:** Specs are reviewed like pull requests.

- Invites, roles at Workspace and Project level (FR-TEN-2..5)
- Block-anchored comment threads with replies, mentions, resolve/reopen (FR-COLLAB-1..3)
- Review summary view; open-thread warning on freeze (FR-COLLAB-4)
- Append-only comment events, polling/SSE refresh (FR-COLLAB-5)

**Done when:** A second member can be invited as commenter, comment inline on a block, and the author can resolve the thread and see it in the review summary.

## M3 — Lifecycle (MVP complete)

**Goal:** The full PRD → ERD → TASKS journey works end to end.

- Status transitions draft → in_review → frozen; freeze pins a version (FR-LIFE-2..3)
- Phase gates: frozen PRD unlocks ERD, frozen ERD unlocks TASKS, pre-seeded context (FR-LIFE-4)
- Fork any version into a new lineage (FR-LIFE-5)
- References: URLs, files, GitHub code refs, spec links; fed to AI context (FR-REF-1..3, FR-AI-8)
- Mermaid rendering in editor and read views (FR-DIAG-1..2)

**Done when:** A team can take one intent from blank page to frozen TASKS entirely inside specpasa, with diagrams and code references in the ERD.

## M4 — Integrations

**Goal:** Frozen specs land in the tools teams already use.

- Integration adapter interface, per-project connections (FR-INT-1)
- GitHub: export spec Markdown to repo; create Issues from TASKS (FR-INT-2)
- Epics grouping in TASKS phase (FR-INT-6)
- ExportRecords with external ID traceability, idempotent re-export (FR-INT-7)
- Then: Linear (FR-INT-5), Jira (FR-INT-4), Google Docs (FR-INT-3)

**Done when:** Freezing a TASKS spec can produce GitHub Issues (and later Linear stories / Jira tickets) whose IDs are visible on the spec.

## M5 — Realtime & local CLIs

**Goal:** Live collaboration and fully-local AI.

- Local CLI adapters: claude, codex via subprocess; host capability detection endpoint (FR-AI-2, FR-AI-5)
- Realtime comments/presence: WebSocket on Node, Durable Objects on Cloudflare (upgrade of FR-COLLAB-5)
- Cloudflare Workers deploy target hardening (D1, cloud-AI-only feature matrix)
- MCP exposure of integration adapters (exploration)

**Done when:** Two users see each other's comments live; a self-hoster with no API keys completes the M3 journey using only local claude CLI or Ollama.

# specpasa — Product Requirements Document

**Status:** Draft v1 · **Last updated:** 2026-07-05 · **Owner:** worldofpasa

---

## 1. Vision

specpasa is a self-hostable visual spec builder. Teams and individuals brainstorm with AI, draft PRDs from rough thoughts and references, review them collaboratively with inline comments, iterate through immutable versions, freeze each phase, and carry the spec through **PRD → ERD → TASKS** — ending with real, trackable work items in GitHub, Jira, or Linear.

**Motto:** _Spec Driven Development is the way to go, and Specs should be built collaboratively._

**Goal:** _Make Spec Driven Development the way of development, connected to the tools, distributed among team members, no silo, add value not friction._

Specs today live in silos — a Google Doc nobody re-reads, a Notion page detached from the code, a whiteboard photo in Slack. specpasa makes the spec the connective tissue: AI-assisted at drafting time, reviewable like a pull request, versioned like code, and exported into the tools teams already use.

## 2. Personas

| Persona                    | Primary phase | What they need                                                                                                                                                  |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PM / founder**           | PRD           | Turn rough thoughts, links, and references into a structured PRD with AI help; gather team feedback; converge and freeze.                                       |
| **Engineer / architect**   | ERD           | Take a frozen PRD into engineering design: reference source code from GitHub, draw mermaid architecture diagrams, weigh options in comments, freeze the design. |
| **Team lead**              | TASKS         | Break a frozen ERD into tasks, group them into epics, push them to GitHub Issues / Jira / Linear with traceability back to the spec.                            |
| **Individual self-hoster** | All           | Run the whole portal on their own machine, use local CLIs (claude, codex) or Ollama with zero cloud dependency, or bring their own API keys.                    |

## 3. Core user journey

1. **Start** — Create a Project in a Workspace, add an Intent ("What are we trying to achieve?"), open a blank Spec in the PRD phase.
2. **Seed** — Dump rough thoughts; attach References (links, files, prior specs, GitHub code).
3. **Draft** — Ask the AI (local CLI, Ollama, or a cloud provider) to generate a draft PRD from the seed material. The draft becomes SpecVersion 1.
4. **Iterate** — Edit blocks, re-prompt the AI to refactor sections, each save producing a new immutable SpecVersion.
5. **Review** — Move the Spec to `in_review`; invited members comment inline on blocks; threads are discussed and resolved; edits produce further versions.
6. **Freeze** — When converged, freeze the PRD. Frozen versions are immutable and citable.
7. **ERD** — The frozen PRD gates the ERD phase. Engineers reference source code via GitHub, add mermaid diagrams, weigh options in comment threads, iterate, and freeze.
8. **TASKS** — The frozen ERD gates the TASKS phase. Work is drafted as Tasks, grouped into Epics, reviewed, and frozen.
9. **Export** — Frozen tasks are pushed to GitHub Issues, Jira tickets, or Linear stories; specs can be saved to GitHub (markdown in repo) or Google Docs. Export records keep the link between spec and work items.
10. **Branch** — At any point, any version can be **forked** into a new Spec lineage to explore an alternative direction without losing the original.

## 4. Functional requirements

### 4.1 Tenancy & access (FR-TEN)

- **FR-TEN-1** — The system is self-hostable as a single Workspace per deployment (Node/Docker default; Cloudflare Workers optional for cloud-AI-only teams).
- **FR-TEN-2** — Users can create Projects within the Workspace.
- **FR-TEN-3** — Workspace owners can invite members by email/link; invites are revocable and expire.
- **FR-TEN-4** — Roles: `owner`, `editor`, `commenter`, `viewer` — assignable at Workspace and Project level; Project role overrides Workspace default.
- **FR-TEN-5** — Editors can create/edit specs; commenters can only comment; viewers are read-only.
- **FR-TEN-6** — First-run setup creates the initial admin (owner) account.

### 4.2 Spec hierarchy (FR-HIER)

- **FR-HIER-1** — A Project contains many Intents; an Intent expresses one goal or problem statement.
- **FR-HIER-2** — An Intent contains many Specs.
- **FR-HIER-3** — A Spec contains many SpecVersions; versions are immutable snapshots; the latest version is the working head.
- **FR-HIER-4** — Spec content is Markdown stored as ordered blocks; each block carries a stable ULID `block_id` that survives edits (the anchor for comments and future CRDT).
- **FR-HIER-5** — Every SpecVersion records author, timestamp, parent version, and whether it was AI-generated.

### 4.3 Spec lifecycle (FR-LIFE)

- **FR-LIFE-1** — A Spec is in exactly one phase: `PRD`, `ERD`, or `TASKS`.
- **FR-LIFE-2** — A Spec has a status: `draft` → `in_review` → `frozen`; transitions are explicit user actions, reversible until frozen.
- **FR-LIFE-3** — Freezing pins a specific SpecVersion; frozen specs cannot be edited (only forked or advanced to the next phase).
- **FR-LIFE-4** — Phase advance (PRD→ERD, ERD→TASKS) requires the current phase to be frozen; advancing creates the next phase's working spec pre-seeded with the frozen content as context.
- **FR-LIFE-5** — Any SpecVersion can be **forked** into a new Spec; the fork records `forked_from_version_id` for lineage.
- **FR-LIFE-6** — Version history is browsable with diffs between any two versions of a spec.

### 4.4 Collaboration (FR-COLLAB)

- **FR-COLLAB-1** — Members can attach a CommentThread to any block (`block_id`), optionally to a text range within the block.
- **FR-COLLAB-2** — Threads support replies, @-mentions, and a resolved/reopened state; resolution records who and when.
- **FR-COLLAB-3** — Threads anchor to block IDs, so they follow blocks across versions; a thread on a deleted block is flagged as orphaned, not lost.
- **FR-COLLAB-4** — A review summary view lists open/resolved threads per spec; freezing warns if threads are open.
- **FR-COLLAB-5** — Comment activity is stored as append-only events so live realtime delivery can be layered on later (v1 uses polling/SSE; live presence is a non-goal, see §6).

### 4.5 AI providers (FR-AI)

- **FR-AI-1** — AI assistance is provider-agnostic behind a single `SpecAgent` interface: brainstorm, draft, refactor section, summarize review feedback, generate tasks/epics.
- **FR-AI-2** — Local CLI adapters: detect and drive `claude` and `codex` CLIs found on the host PATH (Node deployment only).
- **FR-AI-3** — Local model adapter: detect Ollama on `localhost:11434` and use installed models.
- **FR-AI-4** — Cloud adapters: Anthropic, OpenAI, Google, OpenRouter, and any OpenAI-compatible endpoint (custom base URL + key).
- **FR-AI-5** — Host capability detection: the server probes available local CLIs/Ollama and reports capabilities to the UI; unavailable providers are shown but disabled with the reason.
- **FR-AI-6** — Provider configs are scoped to Workspace or individual User; API keys are stored encrypted at rest and never sent to the browser.
- **FR-AI-7** — AI responses stream into the editor; every AI-produced revision is a normal SpecVersion flagged `ai_generated`, fully editable and revertible.
- **FR-AI-8** — AI prompts automatically include the spec's attached References and, for ERD/TASKS phases, the frozen upstream phase content.

### 4.6 References (FR-REF)

- **FR-REF-1** — A Spec can attach References: URLs, uploaded files, GitHub code references (repo/path/ref/lines), and links to other specs.
- **FR-REF-2** — References are part of the AI context for that spec (FR-AI-8).
- **FR-REF-3** — GitHub code references render with syntax highlighting and link back to the source.

### 4.7 Diagrams (FR-DIAG)

- **FR-DIAG-1** — Mermaid code blocks render inline in the editor and in read views (flowcharts, sequence, `erDiagram`, etc.).
- **FR-DIAG-2** — The AI can generate and revise mermaid diagrams as ordinary blocks, especially in the ERD phase.

### 4.8 Integrations & export (FR-INT)

- **FR-INT-1** — Integrations are per-Project adapters with a common interface (connect, export document, create work items); designed to be exposable as MCP servers later.
- **FR-INT-2** — GitHub: save/export a frozen spec as Markdown into a repo (commit/PR); create Issues from frozen TASKS.
- **FR-INT-3** — Google Docs: export a frozen spec as a Doc.
- **FR-INT-4** — Jira: create tickets from frozen TASKS (epics → epics, tasks → issues).
- **FR-INT-5** — Linear: create stories from frozen TASKS (epics → projects/epics, tasks → stories).
- **FR-INT-6** — In the TASKS phase, tasks can be grouped into Epics; ordering and grouping are part of the spec content.
- **FR-INT-7** — Every export writes an ExportRecord mapping spec entities to external IDs (issue numbers, ticket keys, doc URLs) for traceability; re-export updates rather than duplicates where the sink allows.

## 5. Non-functional requirements (NFR)

- **NFR-1** — Self-host onboarding in under 10 minutes: single `docker compose up` with SQLite default; Postgres optional via config.
- **NFR-2** — Dual database support (SQLite/libsql default, Postgres optional) with identical behavior.
- **NFR-3** — Secrets (provider keys, integration tokens) encrypted at rest.
- **NFR-4** — All spec data exportable as plain Markdown — no lock-in.
- **NFR-5** — Works fully offline with local providers (Ollama/CLIs) on the Node deployment.

## 6. Non-goals for v1

- Live CRDT co-editing (Google-Docs-style concurrent cursors) — the block-ID model is designed so this can be added later without migration.
- Realtime presence indicators — v1 collaboration is asynchronous (polling/SSE refresh).
- Mobile app.
- SaaS multi-tenant hosting and billing — v1 is one Workspace per self-hosted deployment.
- Arbitrary document formats (Word, PDF authoring) — Markdown in, Markdown out; PDF/Docs only via export.
- Fine-grained per-spec permissions — roles apply at Workspace/Project level only.

## 7. MVP cut-line (requirements → milestones)

| Milestone                      | Requirements delivered                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Scaffold**              | Repo, CI, DB schema foundations (enables all FR groups; no user-facing features)                                             |
| **M1 — Single-user slice**     | FR-TEN-6, FR-HIER-1..5, FR-LIFE-6 (versions), FR-AI-1, FR-AI-3, FR-AI-4 (one cloud provider), FR-AI-6, FR-AI-7, NFR-1, NFR-2 |
| **M2 — Collaboration**         | FR-TEN-2..5, FR-COLLAB-1..5                                                                                                  |
| **M3 — Lifecycle**             | FR-LIFE-1..5, FR-REF-1..3, FR-DIAG-1..2, FR-AI-8                                                                             |
| **M4 — Integrations**          | FR-INT-1..7 (GitHub first, then Linear, Jira, Google Docs)                                                                   |
| **M5 — Realtime & local CLIs** | FR-AI-2, FR-AI-5, realtime upgrades to FR-COLLAB-5, Cloudflare target hardening                                              |

Everything at or below M3 is the MVP: a team can go blank-page → frozen PRD → frozen ERD → frozen TASKS entirely inside specpasa. M4 makes it connected; M5 makes it live.

## 8. Open questions

- Should freezing require all comment threads resolved, or only warn (current: warn — FR-COLLAB-4)?
- Epic/Task modeling in TASKS phase: structured entities from day one (current plan) vs. convention-over-markdown.
- Google Docs export fidelity: Markdown → Doc conversion limits.
- MCP server surface: which integration operations to expose first.

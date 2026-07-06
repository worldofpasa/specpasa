# specpasa — Domain Model

> Source of truth for the database schema in `packages/db`. Column names and types below are
> normative: snake_case names, SQLite-friendly types (`text` ULIDs for IDs, `integer` unix-ms
> timestamps, `integer` 0/1 booleans, `text` JSON columns). The Postgres dialect maps these
> 1:1 (JSON columns become `jsonb`).

## Hierarchy at a glance

```
Workspace ─┬─ Membership / Invite (people & roles)
           └─ Project ─┬─ ProjectMember
                       ├─ Integration ── ExportRecord
                       └─ Intent ── Spec ─┬─ SpecVersion (immutable) ─┬─ Epic ── Task
                                          ├─ CommentThread ── Comment └─ (blocks with ULIDs)
                                          └─ Reference
```

A **Spec** lives in exactly one phase (`prd` → `erd` → `tasks`). Freezing a spec in one phase
gates creating the next-phase spec. Content is never edited in place: every iteration produces
a new immutable **SpecVersion** made of ordered blocks, each with a stable `block_id` ULID —
the anchor primitive for comments today and CRDT co-editing later.

## ERD

```mermaid
erDiagram
    users {
        text    id PK "ULID"
        text    email UK
        text    name
        text    avatar_url "nullable"
        text    password_hash "nullable; local auth"
        integer created_at "unix ms"
        integer updated_at "unix ms"
    }

    workspaces {
        text    id PK "ULID"
        text    name
        text    slug UK
        text    created_by FK "-> users.id"
        integer created_at
        integer updated_at
    }

    memberships {
        text    id PK "ULID"
        text    workspace_id FK "-> workspaces.id"
        text    user_id FK "-> users.id"
        text    role "owner | editor | commenter | viewer"
        integer created_at
    }

    invites {
        text    id PK "ULID"
        text    workspace_id FK "-> workspaces.id"
        text    email
        text    role "owner | editor | commenter | viewer"
        text    token UK
        text    invited_by FK "-> users.id"
        integer expires_at
        integer accepted_at "nullable"
        integer created_at
    }

    projects {
        text    id PK "ULID"
        text    workspace_id FK "-> workspaces.id"
        text    name
        text    slug "unique per workspace"
        text    description "nullable"
        text    created_by FK "-> users.id"
        integer created_at
        integer updated_at
    }

    project_members {
        text    id PK "ULID"
        text    project_id FK "-> projects.id"
        text    user_id FK "-> users.id"
        text    role "owner | editor | commenter | viewer"
        integer created_at
    }

    intents {
        text    id PK "ULID"
        text    project_id FK "-> projects.id"
        text    title
        text    description "nullable; the rough thought"
        text    created_by FK "-> users.id"
        integer created_at
        integer updated_at
    }

    specs {
        text    id PK "ULID"
        text    intent_id FK "-> intents.id"
        text    title
        text    phase "prd | erd | tasks"
        text    status "draft | in_review | frozen"
        text    current_version_id FK "nullable -> spec_versions.id"
        text    forked_from_version_id FK "nullable -> spec_versions.id; fork lineage"
        text    derived_from_spec_id FK "nullable -> specs.id; prior-phase spec"
        text    created_by FK "-> users.id"
        integer frozen_at "nullable"
        integer created_at
        integer updated_at
    }

    spec_versions {
        text    id PK "ULID"
        text    spec_id FK "-> specs.id"
        integer number "1..n per spec"
        text    parent_version_id FK "nullable -> spec_versions.id"
        text    blocks "JSON: [{block_id, type, markdown}]"
        text    summary "nullable; change note"
        text    created_by FK "-> users.id"
        integer ai_generated "0/1"
        text    ai_provider_config_id FK "nullable -> ai_provider_configs.id"
        integer created_at "immutable rows: no updated_at"
    }

    comment_threads {
        text    id PK "ULID"
        text    spec_id FK "-> specs.id"
        text    block_id "ULID of anchored block"
        text    created_on_version_id FK "-> spec_versions.id"
        text    text_range "nullable JSON: {start, end, quote}"
        text    created_by FK "-> users.id"
        integer resolved_at "nullable"
        text    resolved_by FK "nullable -> users.id"
        integer created_at
    }

    comments {
        text    id PK "ULID"
        text    thread_id FK "-> comment_threads.id"
        text    author_id FK "-> users.id"
        text    body "markdown"
        integer created_at
        integer updated_at
    }

    spec_references {
        text    id PK "ULID"
        text    spec_id FK "-> specs.id"
        text    kind "url | file | github_code | spec"
        text    title
        text    url "nullable"
        text    payload "nullable JSON; kind-specific, see rationale"
        text    created_by FK "-> users.id"
        integer created_at
    }

    ai_provider_configs {
        text    id PK "ULID"
        text    workspace_id FK "nullable -> workspaces.id; XOR user_id"
        text    user_id FK "nullable -> users.id; XOR workspace_id"
        text    kind "local_cli | ollama | openai_compatible | anthropic | google | openrouter"
        text    name "display name"
        text    base_url "nullable; ollama / openai_compatible"
        text    model "nullable; default model id"
        text    cli_command "nullable; local_cli: claude | codex | ..."
        text    encrypted_credentials "nullable; AES-GCM at rest"
        text    settings "nullable JSON; provider extras"
        integer enabled "0/1"
        integer created_at
        integer updated_at
    }

    integrations {
        text    id PK "ULID"
        text    project_id FK "-> projects.id"
        text    kind "github | google_docs | jira | linear"
        text    name "display name"
        text    config "JSON: repo / doc folder / project key / team id"
        text    encrypted_credentials "nullable; AES-GCM at rest"
        text    created_by FK "-> users.id"
        integer created_at
        integer updated_at
    }

    export_records {
        text    id PK "ULID"
        text    integration_id FK "-> integrations.id"
        text    spec_version_id FK "-> spec_versions.id"
        text    epic_id FK "nullable -> epics.id"
        text    task_id FK "nullable -> tasks.id"
        text    external_kind "issue | ticket | story | document | file"
        text    external_id
        text    external_url "nullable"
        text    exported_by FK "-> users.id"
        integer exported_at
    }

    epics {
        text    id PK "ULID"
        text    spec_version_id FK "-> spec_versions.id; tasks-phase version"
        text    title
        text    description "nullable"
        integer position "ordering within version"
        integer created_at
    }

    tasks {
        text    id PK "ULID"
        text    epic_id FK "-> epics.id"
        text    spec_version_id FK "-> spec_versions.id"
        text    title
        text    description "nullable"
        integer position "ordering within epic"
        text    estimate "nullable; freeform (points/hours)"
        text    labels "nullable JSON: string[]"
        integer created_at
    }

    users ||--o{ memberships : "belongs to workspaces via"
    workspaces ||--o{ memberships : has
    workspaces ||--o{ invites : issues
    workspaces ||--o{ projects : contains
    projects ||--o{ project_members : has
    users ||--o{ project_members : joins
    projects ||--o{ intents : groups
    intents ||--o{ specs : contains
    specs ||--o{ spec_versions : "snapshots as"
    spec_versions |o--o{ specs : "forked_from / current"
    specs |o--o{ specs : "derived_from (phase chain)"
    specs ||--o{ comment_threads : "reviewed via"
    comment_threads ||--o{ comments : contains
    specs ||--o{ spec_references : cites
    workspaces |o--o{ ai_provider_configs : "scopes (XOR user)"
    users |o--o{ ai_provider_configs : "scopes (XOR workspace)"
    projects ||--o{ integrations : connects
    integrations ||--o{ export_records : produces
    spec_versions ||--o{ epics : structures
    epics ||--o{ tasks : groups
    spec_versions ||--o{ export_records : "exported as"
```

Unique constraints beyond PKs: `memberships(workspace_id, user_id)`, `project_members(project_id, user_id)`,
`projects(workspace_id, slug)`, `spec_versions(spec_id, number)`, `invites(token)`, `users(email)`, `workspaces(slug)`.

## Rationale

### Immutable versions

A `spec_versions` row is never updated after insert. Iterating on a spec (by a human edit or an
AI refactor) inserts a new row with `parent_version_id` pointing at its predecessor and bumps
`specs.current_version_id`. This gives free history/diffing, makes "frozen" trivially enforceable
(freeze pins `current_version_id`; the state machine in `packages/core` rejects new versions),
and keeps AI provenance auditable per version via `ai_generated` + `ai_provider_config_id`.

### Blocks with stable ULIDs

`spec_versions.blocks` is an ordered JSON array of `{ block_id, type, markdown }` where `type` is
a coarse block kind (`heading`, `paragraph`, `list`, `code`, `mermaid`, `table`, ...). When a new
version is produced, unchanged and edited blocks **keep their `block_id`**; only genuinely new
blocks mint new ULIDs. Two payoffs:

1. **Comment anchoring now** — a thread anchored to a `block_id` re-attaches to that block in any
   version that still contains it, so review conversations survive iteration. If the block was
   deleted, the UI shows the thread against `created_on_version_id` as historical context.
2. **CRDT later** — Yjs models a document as identified fragments. Block ULIDs are exactly the
   identity a CRDT edit surface needs, so live co-editing can replace the editor without
   migrating versions or comments.

### Freeze and fork semantics

- **Freeze**: `status` moves `draft → in_review → frozen` (enforced in `packages/core`, mirrored
  by `frozen_at`). A frozen spec accepts no new versions or status regressions. Freezing is the
  gate for phase progression: creating an `erd` spec requires a frozen `prd` spec in the same
  intent, recorded via `derived_from_spec_id`; likewise `tasks` requires a frozen `erd`.
- **Fork**: forking starts a **new Spec** (fresh version history, `number` restarts at 1) whose
  `forked_from_version_id` points at the exact source version — lineage without entangling the
  original's status or comments. Forks are how teams explore competing directions from a common
  ancestor.

### CommentThread anchor shape

`(spec_id, block_id, created_on_version_id, text_range?)`. `text_range` (`{start, end, quote}`,
offsets into the block's markdown) narrows the anchor within a block; the stored `quote` allows
fuzzy re-anchoring when the block text shifts. Threads carry `resolved_at/resolved_by` — the
review loop is: comment → iterate (new version) → resolve. Comments are append-only events,
which keeps the door open for realtime fan-out (SSE now, WebSocket/Durable Objects later).

### AiProviderConfig scoping (workspace XOR user)

Exactly one of `workspace_id` / `user_id` is set (CHECK constraint). Workspace-scoped configs are
shared team defaults (e.g. the org's OpenRouter key); user-scoped configs are personal (e.g. _my_
local `claude` CLI or `localhost:11434` Ollama — which only exist on the machine running the
Node server anyway). Secrets live in `encrypted_credentials`, AES-GCM encrypted with a server-side
key; `local_cli` and `ollama` kinds typically need none.

### Reference payloads

`spec_references.payload` is kind-specific JSON:

- `url` — none (just `url`)
- `file` — `{ storage_path, mime, size }`
- `github_code` — `{ repo, ref, path, line_start?, line_end? }`
- `spec` — `{ spec_id, version_id? }` (cite another spec, optionally pinned to a version)

References are the curated context fed to the AI when drafting or refactoring a version.

### ExportRecord as the integration ledger

Every push through an `integrations` adapter writes an `export_records` row mapping internal
objects to external ones: an epic → GitHub issue / Jira epic / Linear project, a task → issue /
ticket / story, a whole `spec_version` → repo markdown file or Google Doc (`external_kind`
`document|file`, `epic_id`/`task_id` null). This makes exports idempotent (re-export updates the
known `external_id` instead of duplicating) and gives the UI stable backlinks (`external_url`).

### Epics and tasks

`epics`/`tasks` are the structured output of the `tasks` phase, denormalized from the version's
markdown blocks so they can be ordered (`position`), grouped, and exported individually. They hang
off the immutable `spec_version` they were finalized from; external identity after export lives in
`export_records`, not on the rows themselves.

### Out of scope here

Auth sessions/tokens arrive with M1 (single-admin auth) and are infrastructure, not domain.
Realtime presence needs no persistence in v1.

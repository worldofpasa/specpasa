# specpasa

Self-hosted collaborative spec builder. Specs move through phases **prd → erd → tasks**; each phase is iterated as immutable versions, reviewed with block-anchored comments, frozen, then carried to the next phase and finally exported (GitHub Issues, Jira, Linear).

The product docs in `docs/` are the source of truth — read them before changing domain logic:

- `docs/prd.md` — requirements with stable IDs (FR-TEN, FR-HIER, FR-LIFE, FR-COLLAB, FR-AI, FR-REF, FR-DIAG, FR-INT, NFR)
- `docs/domain-model.md` — entities/ERD; the Drizzle schema is written from this
- `docs/architecture.md` — ADR-1..7 (stack, deploy, db, AI providers, editor/versioning, realtime, integrations)
- `docs/roadmap.md` — milestones M0–M5 (currently: M0 scaffold done)

## Monorepo map

- `apps/web` — Astro 7 app (`@specpasa/web`): Node adapter (default deploy), React islands for interactive UI, Tailwind v4 via `@tailwindcss/vite`
- `packages/core` — `@specpasa/core`: domain types/enums, spec lifecycle state machine (`lifecycle.ts`), ULID helper. Pure, runtime-agnostic — no Node APIs
- `packages/db` — `@specpasa/db`: Drizzle schema (SQLite/libsql default), migrations in `drizzle/`, `createDb()` client factory
- `packages/providers` — `@specpasa/providers`: `SpecAgent` interface + AI adapter stubs (local CLI, Ollama, OpenAI-compatible, Anthropic)

Dependency direction is strictly downward: web → providers/db → core.

## Commands

- `pnpm dev` — Astro dev server (note: Astro 7 dev server detaches; stop with `pnpm --filter @specpasa/web exec astro dev stop`)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — vitest tests live in `packages/*/test/`
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations against `data/specpasa.db` (override with `DATABASE_URL`)
- `pnpm build` — typecheck + production build

## Conventions

- IDs are app-generated ULIDs (`newId()` from `@specpasa/core`), never DB sequences; timestamps are unix-ms integers; JSON columns are text-mode — this keeps the schema portable across SQLite/Postgres/D1 (ADR-3)
- `SpecVersion` rows are immutable; iteration always appends a new version. Block IDs inside `blocks` are stable across versions — they anchor comment threads and the future CRDT layer (ADR-5)
- Status transitions must go through `@specpasa/core` `lifecycle.ts`; frozen specs are never thawed — fork instead
- Local CLI / Ollama code paths are Node-only; keep them out of anything that must run on the optional Cloudflare Workers target (ADR-2)

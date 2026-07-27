# specpasa

Self-hosted collaborative spec builder. Specs move through phases **prd → erd → tasks**; each phase is iterated as immutable versions, reviewed with block-anchored comments, frozen, then carried to the next phase and finally exported (GitHub Issues, Jira, Linear).

The product docs in `docs/` are the source of truth — read them before changing domain logic:

- `docs/prd.md` — requirements with stable IDs (FR-TEN, FR-HIER, FR-LIFE, FR-COLLAB, FR-AI, FR-REF, FR-DIAG, FR-INT, NFR)
- `docs/domain-model.md` — entities/ERD; the Drizzle schema is written from this
- `docs/architecture.md` — ADR-1..7 (stack, deploy, db, AI providers, editor/versioning, realtime, integrations)
- `docs/roadmap.md` — milestones M0–M5 (done: M1–M3 + M5's local-CLI slice, on SQLite; remaining: M4 integrations, M5 realtime, Postgres parity)

## Monorepo map

- `apps/web` — Astro 7 app (`@specpasa/web`): Node adapter (default deploy), React islands for interactive UI, Tailwind v4 via `@tailwindcss/vite`
- `apps/desktop` — Tauri 2 shell (`@specpasa/desktop`): bundles the built web server + an npm-staged runtime tree (`scripts/stage-server.mjs`), spawns it with system Node (≥22) on port 4977 with SQLite in the OS app-data dir, and points the webview at it. Rust side handles enriched-PATH resolution (GUI apps don't inherit the login-shell PATH — needed so the server finds `node` and `claude`), migrations, readiness, and process-group cleanup. A Server menu / splash form can instead point the webview at a self-hosted instance (`settings.json` `server_url` in app-data — Bitwarden-style); local server is skipped while remote. Desktop builds bake `SPECPASA_DESKTOP_BUILD=1`: non-Secure session cookie (WKWebView drops Secure cookies on http://127.0.0.1) and a cwd-relative session dir. Local mode also sets `SPECPASA_LOCAL_AUTOLOGIN=1` at spawn: the middleware signs requests in automatically (existing single user, else a passwordless owner provisioned from the OS username via `lib/provision.ts`) — password auth remains for self-hosted/Docker
- `packages/core` — `@specpasa/core`: domain types/enums, spec lifecycle state machine (`lifecycle.ts`), ULID helper. Pure, runtime-agnostic — no Node APIs
- `packages/db` — `@specpasa/db`: Drizzle schema (SQLite/libsql default), migrations in `drizzle/`, `createDb()` client factory
- `packages/providers` — `@specpasa/providers`: `SpecAgent` interface + AI adapter stubs (local CLI, Ollama, OpenAI-compatible, Anthropic)

Dependency direction is strictly downward: web → providers/db → core.

## Commands

- `pnpm dev` — Astro dev server (note: Astro 7 dev server detaches; stop with `pnpm --filter @specpasa/web exec astro dev stop`)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` — vitest tests live in `packages/*/test/`
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations against `data/specpasa.db` (override with `DATABASE_URL`)
- `pnpm build` — typecheck + production build
- `pnpm desktop:dev` — Tauri shell against the astro dev server (start `pnpm dev` first); `pnpm desktop:build` — stage self-contained server + build the .app/.dmg (needs rustup)

## Conventions

- IDs are app-generated ULIDs (`newId()` from `@specpasa/core`), never DB sequences; timestamps are unix-ms numbers; JSON/boolean columns present identical TS value shapes through Drizzle in both dialects (ADR-3). The SQLite schema is the source of truth; `schema.pg.ts` mirrors it, parity-tested in CI. App code imports `schema` and query operators from `apps/web/src/lib/db` — never from `@specpasa/db`/`drizzle-orm` directly
- `SpecVersion` rows are immutable; iteration always appends a new version. Block IDs inside `blocks` are stable across versions — they anchor comment threads and the future CRDT layer (ADR-5)
- Status transitions must go through `@specpasa/core` `lifecycle.ts`; frozen specs are never thawed — fork instead
- Local CLI / Ollama code paths are Node-only; keep them out of anything that must run on the optional Cloudflare Workers target (ADR-2)
- Demo/E2E/fixture user is always **James Bond** (`james@bond.com`) — never real names, emails, or other PII in screenshots, seeds, or test fixtures
- All user-facing copy lives in `apps/web/src/lib/strings.ts` (`APP_NAME`, `pageTitle()`, `t.*`) — no naked string literals in pages or islands; the spec workspace's block wrappers expose stable `data-block-id` anchors that comments (M2) and future CRDT work key on

# Contributing to specpasa

Thanks for your interest in improving specpasa! Issues and pull requests are welcome.

## Getting set up

Requirements: Node ≥ 22, pnpm ≥ 11.

```sh
pnpm install
cp .env.example .env        # set SPECPASA_SECRET (required, min 16 chars)
pnpm db:migrate             # creates data/specpasa.db (SQLite by default)
pnpm dev                    # http://localhost:4321 — first visit runs admin setup
```

## Before you open a PR

CI runs these on every pull request — please run them locally first:

```sh
pnpm lint
pnpm format:check           # or `pnpm format` to fix
pnpm test
pnpm build                  # includes typecheck
```

## Repository layout

This is a pnpm monorepo; dependencies point strictly downward (web → providers/db → core):

- `apps/web` — Astro 7 app: Node adapter, React islands, Tailwind v4
- `apps/desktop` — optional Tauri 2 shell around the web app (standalone local server or connect to self-hosted); see [apps/desktop/README.md](apps/desktop/README.md)
- `packages/core` — domain types, spec lifecycle state machine, ULID helper (pure, no Node APIs)
- `packages/db` — Drizzle schema (SQLite default, Postgres mirror), migrations, client factory
- `packages/providers` — `SpecAgent` interface + AI adapters (local CLI, Ollama, OpenAI-compatible, Anthropic)

The product docs in `docs/` are the source of truth for domain behavior — read the relevant one before changing domain logic: [prd.md](docs/prd.md), [domain-model.md](docs/domain-model.md), [architecture.md](docs/architecture.md) (ADRs), [roadmap.md](docs/roadmap.md).

## Conventions that will come up in review

- **IDs & timestamps** — app-generated ULIDs via `newId()` from `@specpasa/core` (never DB sequences); timestamps are unix-ms numbers.
- **Database access** — app code imports `schema` and query operators from `apps/web/src/lib/db`, never from `@specpasa/db` or `drizzle-orm` directly. The SQLite schema is the source of truth; `schema.pg.ts` mirrors it and a parity test enforces that.
- **Versions are immutable** — `SpecVersion` rows are never edited; iteration appends a new version. Block IDs are stable across versions (they anchor comment threads).
- **Lifecycle** — status transitions go through `lifecycle.ts` in `@specpasa/core`; frozen specs are never thawed — fork instead.
- **User-facing copy** — lives in `apps/web/src/lib/strings.ts`; no naked string literals in pages or islands.
- **Fixtures & screenshots** — the demo user is always **James Bond** (`james@bond.com`). Never real names, emails, or other PII in seeds, tests, or screenshots.
- **Commit messages** — conventional-commit style scoped to the package, e.g. `feat(web): …`, `fix(db): …`.

Tests live in `packages/*/test/` and run with vitest (`pnpm test`).

## License

specpasa is licensed under [AGPL-3.0-only](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.

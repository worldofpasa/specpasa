# specpasa

> **Spec Driven Development is the way to go, and Specs should be built collaboratively.**

specpasa is a self-hosted visual spec builder. Start from rough thoughts and references, brainstorm with AI into a draft PRD, review it together with inline comments, iterate through immutable versions, freeze — then carry the spec forward: **PRD → ERD → TASKS**, ending as real work items in GitHub Issues, Jira, or Linear.

**Goal:** make Spec Driven Development the way of development — connected to the tools, distributed among team members, no silos; add value, not friction.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/study-workspace-dark.png" />
  <img alt="The spec workspace: title block with live presence avatars, outline/references/connectors sidebar, serif document sheet with review flags, comment threads in the rail, and the revision strip with Ask AI docked below" src="docs/assets/study-workspace-light.png" />
</picture>

## How it works

1. Create a **project**, invite members, and capture an **intent**.
2. Open a blank **spec**, dump rough thoughts and references (links, files, GitHub code).
3. Let AI draft the PRD — using your **local CLI** (claude, codex), **local Ollama**, or **cloud providers** (Anthropic, OpenAI, Google, OpenRouter, any OpenAI-compatible endpoint).
4. Teammates comment inline on blocks; threads are resolved; edits autosave to a working draft and become an immutable version only when you say so.
5. **Freeze** the PRD → start the **ERD** phase: reference source code, weigh options, draw mermaid diagrams.
6. Freeze the ERD → break it down into **tasks**, group into epics, and export to GitHub, Jira, or Linear.
7. Fork any spec from any version to explore a different direction.

## A look inside

The workspace above is the core loop: a **title block** carries the spec's phase, revision, status stamp, and a Google-Docs-style **presence crew**; the left rail stacks **outline · references · connectors** (GitHub live, Drive/Confluence/Jira surfaced); the document is a serif sheet whose commented blocks wear a marigold flag; block-anchored **review threads** live on the right; and the **revision strip** docks at the bottom — freezing stays gated while threads are open, with the count updating live.

**Ask AI** sits centered in the dock — hover opens the composer, which shows exactly what context the draft will use: toggle chips for every attached reference, plus every open review comment folded in automatically:

![The Ask AI composer open above the revision strip: prompt box, provider picker, reference context chips, and a note that open review comments will be included](docs/assets/study-askai-light.png)

**References** attach through a modal — file uploads (type-allowlisted, previewable in place), URLs that auto-title themselves, GitHub code, or sibling specs — and feed straight into AI drafting context:

![The add-reference modal defaulting to file upload, with kind picker, auto-filled title, and file chooser](docs/assets/study-reference-modal-light.png)

<table>
  <tr>
    <th>Version history — AI drafts are marked, any version forks</th>
    <th>Specs at a glance — phase badge and lifecycle stamp per spec</th>
  </tr>
  <tr>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/study-versions-dark.png" />
        <img alt="Version history list with mono version badges, AI-generated markers, and fork buttons" src="docs/assets/study-versions-light.png" />
      </picture>
    </td>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/study-intent-dark.png" />
        <img alt="An intent's spec list with phase badges and draft/in-review/frozen stamps" src="docs/assets/study-intent-light.png" />
      </picture>
    </td>
  </tr>
  <tr>
    <th>AI providers — local CLIs &amp; Ollama detected, keys encrypted</th>
    <th>Sign in — the same design system from the first screen</th>
  </tr>
  <tr>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/study-providers-dark.png" />
        <img alt="Provider settings detecting Ollama and local CLIs, with add-provider modals" src="docs/assets/study-providers-light.png" />
      </picture>
    </td>
    <td>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/assets/study-login-dark.png" />
        <img alt="The login screen: serif wordmark and a centered form card on a faint drafting grid" src="docs/assets/study-login-light.png" />
      </picture>
    </td>
  </tr>
</table>

Every screen ships in light and dark — a warm paper theme and a lamp-lit charcoal one, switchable from the nav or following the OS.

## Status

**M1–M4 plus M5's realtime and local-CLI slices are complete** (on SQLite): the full journey from blank spec → AI draft (cloud, Ollama, or the local `claude` CLI — no API key) → inline block-anchored review with live presence, roles, and invites → working-draft autosave with explicit immutable versions → freeze → next phase, fork, or **export to GitHub** (document commits + one issue per epic, idempotently). The whole app wears "The Study" design system — warm paper and lamp-lit charcoal themes, self-hosted type, modal flows. Next up: Jira/Linear/Drive connectors and Postgres parity in CI. See [docs/roadmap.md](docs/roadmap.md), and the spec documents this project was (of course) built from:

- [Product requirements](docs/prd.md)
- [Domain model](docs/domain-model.md)
- [Architecture & ADRs](docs/architecture.md)

## Development

Requirements: Node ≥ 22, pnpm ≥ 11.

```sh
pnpm install
cp .env.example .env        # set SPECPASA_SECRET (required, min 16 chars)
pnpm db:migrate             # creates data/specpasa.db (SQLite by default)
pnpm dev                    # http://localhost:4321 — first visit runs admin setup
```

`pnpm test`, `pnpm typecheck`, and `pnpm lint` cover the workspace. The repo is a pnpm monorepo: `apps/web` (Astro 7 + React islands), `apps/desktop` (optional Tauri shell — see below), `packages/core` (domain logic), `packages/db` (Drizzle), `packages/providers` (AI adapters).

## Desktop app (optional)

In addition to the browser/self-hosted web app, this repo includes a **native desktop shell** (`apps/desktop`, Tauri 2). It is the same product UI in a window — not a separate codebase — and can run in two modes:

| Mode            | What happens                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Standalone**  | Shell starts a local Node server (bundled web build) + SQLite in OS app-data; auto-login for a single local user |
| **Self-hosted** | Shell opens your existing deployment URL; no local server; normal login/invites                                  |

### Local desktop setup

Extra requirements on top of the web stack: **Rust / rustup** and [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Standalone mode also needs **Node ≥ 22 on PATH** at runtime (Node is not embedded in the installer).

```sh
pnpm install

# Terminal 1 — web dev server (required for desktop:dev)
pnpm dev

# Terminal 2 — open the native shell against that server
pnpm desktop:dev
```

Package a production build on your machine (macOS example produces `.app` / `.dmg`):

```sh
pnpm desktop:build
# → apps/desktop/src-tauri/target/release/bundle/
```

Prebuilt (unsigned) installers for **macOS, Linux, and Windows** are published on the [GitHub Releases page](https://github.com/worldofpasa/specpasa/releases) — CI builds them from `desktop-v*` tags on a native-runner matrix. End users still need system Node ≥ 22 for standalone mode. Full mode details, Server menu, packaging caveats, and troubleshooting: **[apps/desktop/README.md](apps/desktop/README.md)**.

## Self-hosting

```sh
docker compose up            # SQLite in ./data by default
docker compose --profile postgres up   # optional Postgres for teams
```

To run the app against Postgres, point `DATABASE_URL` at it — the dialect is picked from the URL and migrations route automatically:

```sh
DATABASE_URL=postgres://specpasa:specpasa@localhost:5432/specpasa pnpm db:migrate
DATABASE_URL=postgres://specpasa:specpasa@localhost:5432/specpasa pnpm dev
```

The Node/Docker deployment is the default target — it's what enables local CLI and Ollama detection. A Cloudflare Workers target (cloud AI only) is planned; see ADR-2 in [docs/architecture.md](docs/architecture.md).

The desktop shell can **connect to this self-hosted instance** via **Server → Connect to Self-Hosted Server…** (or run standalone with its own local database). See [apps/desktop/README.md](apps/desktop/README.md).

## License

AGPL-3.0-only

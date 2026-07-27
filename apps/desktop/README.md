# @specpasa/desktop

Optional **Tauri 2 desktop shell** for specpasa. It is not a separate product — it wraps the same web app from `apps/web` in a native window and can either:

1. **Standalone (local)** — start a bundled Node server on your machine (SQLite in the OS app-data directory), or
2. **Self-hosted** — point the webview at a remote/self-hosted specpasa instance (Bitwarden-style).

> **Status:** installers for macOS (Apple Silicon + Intel), Linux, and Windows are built by CI — pushing a `desktop-v*` tag attaches them to a GitHub Release. Builds are unsigned (no Apple notarization / Windows code signing yet). See [Packaging](#packaging-mac-linux-windows).

## How it relates to the web app

| Piece                     | Role                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `apps/web`                | Full product UI + API (source of truth)                      |
| `apps/desktop`            | Native shell: process manager, splash, Server menu, settings |
| Staged `resources/server` | Production build of the web app, copied in at package time   |

The desktop package **cannot run without the web app** (or a remote server URL). In standalone mode it embeds a staged copy of the web server; in self-hosted mode it only loads that URL.

## Prerequisites

| Tool                       | Why                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Node.js ≥ 22**           | Runtime for the local server (not bundled into the `.app` / installer). Must be on PATH when the desktop app launches.               |
| **pnpm ≥ 11**              | Monorepo install and scripts                                                                                                         |
| **Rust + rustup**          | Tauri / cargo build                                                                                                                  |
| Platform webview deps      | [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Xcode CLT on macOS, WebView2 on Windows, webkit2gtk etc. on Linux) |
| Optional: **`claude` CLI** | Local interview / CLI AI features (discovered via PATH)                                                                              |

## Local development

From the **repo root**:

```sh
pnpm install

# Terminal 1 — web app (required for desktop:dev)
pnpm dev
# → http://localhost:4321

# Terminal 2 — native shell pointed at the dev server
pnpm desktop:dev
```

`desktop:dev` uses `devUrl: http://localhost:4321` from `src-tauri/tauri.conf.json`. If the Astro server is not running, the webview will fail to load the app.

### Useful scripts

| Command                                 | What it does                                                         |
| --------------------------------------- | -------------------------------------------------------------------- |
| `pnpm desktop:dev`                      | Tauri dev shell → live web dev server                                |
| `pnpm desktop:build`                    | Stage web server + production Tauri build                            |
| `pnpm --filter @specpasa/desktop stage` | Only stage `src-tauri/resources/server` (build web with desktop env) |

Staging sets `SPECPASA_DESKTOP_BUILD=1` so the web build uses desktop-friendly session cookies (WKWebView drops `Secure` cookies on `http://127.0.0.1`).

## Standalone vs self-hosted

### Standalone (default)

When **no** remote URL is configured:

1. The shell finds system `node` (≥ 22) via an enriched PATH (login shell + common install locations).
2. It runs migrations, then spawns the bundled server on **127.0.0.1**, preferring port **4977**.
3. SQLite, sessions, uploads, and logs live in the **OS app-data directory** (not inside the sealed app bundle).
4. `SPECPASA_LOCAL_AUTOLOGIN=1` is set: middleware signs you in automatically (existing single user, or a passwordless owner derived from the OS username). Password login remains for normal self-hosted / Docker deploys.

Use this when you want a personal, offline-capable instance on your laptop.

### Self-hosted (connect to an existing server)

When you want the desktop window to talk to a team or Docker deployment instead of the local DB:

1. Open **Server → Connect to Self-Hosted Server…** (or use the splash form if a URL fails).
2. Enter an `http://` or `https://` base URL (e.g. `https://specs.example.com`).
3. The local bundled server is **not** started; the webview navigates to that URL.
4. Auth is whatever that server uses (setup / login / invites) — **no** local autologin.

To return to the laptop DB: **Server → Use Local Server**.

Settings are stored as `settings.json` under the app-data directory:

```json
{ "server_url": "https://specs.example.com" }
```

Clear `server_url` (or use **Use Local Server**) to go back to standalone.

|                | Standalone                     | Self-hosted                          |
| -------------- | ------------------------------ | ------------------------------------ |
| Server process | Bundled, spawned by the shell  | Your deployment (Docker, Node, etc.) |
| Data           | Local SQLite in app-data       | Whatever the remote instance uses    |
| Auth           | Auto-login (single user)       | Normal password / invite flow        |
| AI local CLI   | Works if `node` + CLIs on PATH | Only if that host can run local CLIs |

## Packaging (Mac, Linux, Windows)

Tauri's bundle targets (`app`, `dmg`, `deb`, `rpm`, `appimage`, `nsis`) are filtered per platform, so a production build on each OS produces its native installers:

```sh
# On the target OS (or matching CI runner)
pnpm install
pnpm desktop:build
```

Artifacts land under:

```text
apps/desktop/src-tauri/target/release/bundle/
```

Typical outputs:

| OS      | Examples                    |
| ------- | --------------------------- |
| macOS   | `.app`, `.dmg`              |
| Linux   | `.deb`, `.rpm`, `.AppImage` |
| Windows | NSIS `.exe` installer       |

### Releases (CI)

`.github/workflows/desktop.yml` builds all four installers on a runner matrix (`macos-latest`, `macos-15-intel`, `ubuntu-22.04`, `windows-latest`). To cut a release:

```sh
# 1. Bump the version in src-tauri/tauri.conf.json, src-tauri/Cargo.toml, package.json
# 2. Tag and push — CI creates the GitHub Release and attaches the installers
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

A `workflow_dispatch` run builds the same installers as workflow artifacts without creating a release.

### Cross-platform notes

- **Build per OS.** Tauri does not reliably produce macOS, Windows, and Linux installers from a single machine — the release workflow builds each on its native runner.
- **End users still need Node ≥ 22** on PATH for standalone mode. The installer embeds the server tree, not a Node runtime.
- **Builds are unsigned.** macOS Gatekeeper requires right-click → Open (or `xattr -dr com.apple.quarantine`) on first launch; Windows SmartScreen shows a "More info → Run anyway" prompt. Developer ID notarization / Authenticode signing are future work.
- MSI is intentionally skipped on Windows: the staged server tree is ~18k files and WiX harvesting chokes on it; NSIS handles it fine.

## Troubleshooting

| Symptom                                    | Things to check                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Blank window / load error in `desktop:dev` | Is `pnpm dev` running on port 4321?                                                                                                            |
| “could not start” / server not ready       | Is Node ≥ 22 installed and findable? Check `logs/server.log` in the app-data folder.                                                           |
| Login loop (packaged app)                  | Desktop builds must use `SPECPASA_DESKTOP_BUILD=1` (the stage script sets this).                                                               |
| Self-hosted “unreachable”                  | URL must be `http(s)://…`; server must answer HTTP from this machine.                                                                          |
| Local AI / `claude` not found              | GUI apps get a short PATH; install CLI where the enriched PATH looks (e.g. Homebrew, `~/.local/bin`) or launch from a terminal once to verify. |

App-data locations (defaults for identifier `com.worldofpasa.specpasa`):

- **macOS:** `~/Library/Application Support/com.worldofpasa.specpasa/`
- **Linux:** `~/.local/share/com.worldofpasa.specpasa/` (or `$XDG_DATA_HOME/…`)
- **Windows:** `%APPDATA%\com.worldofpasa.specpasa\`

## Layout

```text
apps/desktop/
├── package.json
├── scripts/stage-server.mjs   # build web + stage resources/server
├── ui/index.html              # splash / connect form
└── src-tauri/
    ├── src/                   # Rust: boot, PATH, settings, menu
    ├── resources/server/      # staged production server (generated)
    └── tauri.conf.json
```

For product and monorepo context, see the [root README](../../README.md) and [CLAUDE.md](../../CLAUDE.md).

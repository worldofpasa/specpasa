// @ts-check
import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Node adapter is the default self-host target: local CLI (claude, codex) and
// Ollama detection require a real Node process on the host. A Cloudflare
// Workers target (cloud-AI-only) is planned as an alternate adapter — see
// docs/architecture.md ADR-2.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Desktop-build session overrides (dev and Docker keep the adapter
  // defaults — there build path == run path, and browsers exempt localhost):
  // - fs-lite base must be RELATIVE for a relocatable .app; the shell sets
  //   cwd to the OS app-data dir, so sessions land outside the sealed bundle
  // - WKWebView drops Secure cookies over plain http://127.0.0.1 (no
  //   localhost exemption like Chrome), which silently loops login — the
  //   desktop cookie opts out of the production Secure default
  ...(process.env.SPECPASA_DESKTOP_BUILD
    ? {
        session: {
          driver: { entrypoint: "unstorage/drivers/fs-lite", config: { base: "./sessions" } },
          cookie: { secure: false },
        },
      }
    : {}),
  env: {
    // Validated, typed env (fail fast at boot instead of at request time).
    // Secrets are server-only — astro:env prevents them from reaching the
    // client bundle. Values load from the repo-root .env (envDir below) or
    // the process environment (Docker/compose).
    schema: {
      SPECPASA_SECRET: envField.string({ context: "server", access: "secret", min: 16 }),
      DATABASE_URL: envField.string({
        context: "server",
        access: "secret",
        default: "file:../../data/specpasa.db",
      }),
      PUBLIC_APP_URL: envField.string({
        context: "client",
        access: "public",
        default: "http://localhost:4321",
      }),
    },
  },
  vite: {
    // Read .env from the repo root so dev, Docker, and db scripts share one file.
    envDir: fileURLToPath(new URL("../..", import.meta.url)),
    plugins: [tailwindcss()],
    // The Agent SDK locates its bundled CLI relative to its own package dir
    // (import.meta.url) — inlining it into a chunk breaks that. Node-only
    // dependency, resolved from node_modules at runtime (ADR-2).
    ssr: { external: ["@anthropic-ai/claude-agent-sdk"] },
  },
});

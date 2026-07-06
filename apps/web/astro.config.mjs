// @ts-check
import { defineConfig } from "astro/config";
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
  vite: {
    plugins: [tailwindcss()],
  },
});

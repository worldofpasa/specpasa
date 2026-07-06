/**
 * Node-only entry (`@specpasa/providers/node`): everything that needs
 * child_process or the filesystem lives behind this subpath so the root
 * export stays importable on Cloudflare Workers (ADR-2).
 */
export * from "./local-cli.js";
export * from "./detect.js";
export * from "./factory.js";
export * from "./claude-stream.js";

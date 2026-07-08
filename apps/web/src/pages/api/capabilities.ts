import type { APIRoute } from "astro";
import { detectLocalProvidersNode } from "@specpasa/providers/node";
import { getDb, schema, eq } from "../../lib/db";

/**
 * Host capability probe (FR-AI-5, ADR-4): what local AI backends exist on
 * this machine, plus which providers are configured. The provider picker
 * and settings UI render only what is actually available.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });

  const [local, configs] = await Promise.all([
    detectLocalProvidersNode(),
    getDb()
      .select({
        id: schema.ai_provider_configs.id,
        kind: schema.ai_provider_configs.kind,
        name: schema.ai_provider_configs.name,
        model: schema.ai_provider_configs.model,
        cli_command: schema.ai_provider_configs.cli_command,
      })
      .from(schema.ai_provider_configs)
      .where(eq(schema.ai_provider_configs.enabled, true)),
  ]);

  return new Response(JSON.stringify({ local, configured: configs }), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
};

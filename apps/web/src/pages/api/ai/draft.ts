import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { decryptSecret, newId, type SpecBlock } from "@specpasa/core";
import { schema } from "@specpasa/db";
import {
  createAnthropicAgent,
  createOllamaAgent,
  type AgentRequest,
  type SpecAgent,
} from "@specpasa/providers";
import { getDb, getSecret } from "../../../lib/db";

async function buildAgent(
  config: typeof schema.ai_provider_configs.$inferSelect,
): Promise<SpecAgent | null> {
  if (config.kind === "anthropic") {
    if (!config.encrypted_credentials) return null;
    const apiKey = await decryptSecret(config.encrypted_credentials, getSecret());
    return createAnthropicAgent({ apiKey, model: config.model ?? undefined });
  }
  if (config.kind === "ollama") {
    if (!config.model) return null;
    return createOllamaAgent({ model: config.model, baseUrl: config.base_url ?? undefined });
  }
  return null;
}

interface DraftContext {
  spec: typeof schema.specs.$inferSelect;
  config: typeof schema.ai_provider_configs.$inferSelect;
  latest: typeof schema.spec_versions.$inferSelect | undefined;
  prompt: string;
}

async function resolveDraftContext(request: Request): Promise<DraftContext | Response> {
  const { specId, providerId, prompt } = (await request.json()) as {
    specId?: string;
    providerId?: string;
    prompt?: string;
  };
  if (!specId || !providerId || !prompt?.trim()) {
    return new Response("specId, providerId, and prompt are required", { status: 400 });
  }
  const db = getDb();
  const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, specId));
  if (!spec) return new Response("Spec not found", { status: 404 });
  if (spec.status === "frozen") return new Response("Spec is frozen", { status: 403 });
  const [config] = await db
    .select()
    .from(schema.ai_provider_configs)
    .where(eq(schema.ai_provider_configs.id, providerId));
  if (!config?.enabled) return new Response("Provider not found", { status: 404 });
  const [latest] = await db
    .select()
    .from(schema.spec_versions)
    .where(eq(schema.spec_versions.spec_id, spec.id))
    .orderBy(desc(schema.spec_versions.number))
    .limit(1);
  return { spec, config, latest, prompt };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const context = await resolveDraftContext(request);
  if (context instanceof Response) return context;
  const { spec, config, latest, prompt } = context;

  const agent = await buildAgent(config);
  if (!agent) return new Response("Provider is misconfigured", { status: 400 });

  const db = getDb();
  const blocks: SpecBlock[] = latest?.blocks ?? [];

  const agentRequest: AgentRequest = { prompt, blocks, phase: spec.phase };
  const events = blocks.length ? agent.refine(agentRequest) : agent.draft(agentRequest);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
      try {
        for await (const event of events) {
          if (event.type === "done") {
            const ts = Date.now();
            const versionId = newId();
            const number = (latest?.number ?? 0) + 1;
            await db.insert(schema.spec_versions).values({
              id: versionId,
              spec_id: spec.id,
              number,
              parent_version_id: latest?.id ?? null,
              blocks: event.blocks,
              summary: `AI ${blocks.length ? "revision" : "draft"}: ${prompt.slice(0, 120)}`,
              created_by: user.id,
              ai_generated: true,
              ai_provider_config_id: config.id,
              created_at: ts,
            });
            await db
              .update(schema.specs)
              .set({ current_version_id: versionId, updated_at: ts })
              .where(eq(schema.specs.id, spec.id));
            send({ type: "done", number });
          } else {
            send(event);
          }
        }
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" },
  });
};

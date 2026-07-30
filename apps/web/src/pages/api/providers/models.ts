import type { APIRoute } from "astro";
import { SPECPASA_SECRET } from "astro:env/server";
import { AI_PROVIDER_KINDS, decryptSecret, type AiProviderKind } from "@specpasa/core";
import { listProviderModels, type CatalogModel } from "@specpasa/providers";
import { getWorkspace } from "../../../lib/auth";
import { getDb, schema, and, eq } from "../../../lib/db";

interface ModelsRequestBody {
  providerId?: string;
  kind?: string;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Model suggestions for the settings pickers (FR-AI-4). POST only — an API
 * key may ride along for not-yet-saved configs and must never land in a URL.
 * For saved configs the stored key is decrypted server-side and never
 * returned; the response is only [{id, label}].
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return new Response("Unauthorized", { status: 401 });

  let body: ModelsRequestBody;
  try {
    body = (await request.json()) as ModelsRequestBody;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  let models: CatalogModel[];
  if (body.providerId) {
    const workspace = await getWorkspace(locals.user.id);
    const [config] = await getDb()
      .select()
      .from(schema.ai_provider_configs)
      .where(
        and(
          eq(schema.ai_provider_configs.id, body.providerId),
          eq(schema.ai_provider_configs.workspace_id, workspace.id),
        ),
      );
    if (!config) return new Response("Provider not found", { status: 404 });
    models = await listProviderModels({
      kind: config.kind,
      baseUrl: config.base_url,
      apiKey: config.encrypted_credentials
        ? await decryptSecret(config.encrypted_credentials, SPECPASA_SECRET)
        : null,
    });
  } else if (body.kind && (AI_PROVIDER_KINDS as readonly string[]).includes(body.kind)) {
    models = await listProviderModels({
      kind: body.kind as AiProviderKind,
      baseUrl: body.baseUrl || null,
      apiKey: body.apiKey || null,
    });
  } else {
    return new Response("providerId or kind is required", { status: 400 });
  }

  return new Response(JSON.stringify({ models }), {
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
};

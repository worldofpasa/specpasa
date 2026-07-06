import { ActionError, defineAction } from "astro:actions";
import { SPECPASA_SECRET } from "astro:env/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { blocksFromMarkdown, encryptSecret, newId } from "@specpasa/core";
import { schema } from "@specpasa/db";
import { IMPLEMENTED_AI_PROVIDER_KINDS } from "@specpasa/providers";
import { getWorkspace, hashPassword, verifyPassword } from "../lib/auth";
import { getDb } from "../lib/db";

const now = () => Date.now();

async function requireUser(context: { session?: { get(key: string): Promise<unknown> } }) {
  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) throw new ActionError({ code: "UNAUTHORIZED", message: "Sign in first" });
  return userId;
}

export const server = {
  setup: defineAction({
    accept: "form",
    input: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      workspaceName: z.string().min(1),
    }),
    handler: async (input, context) => {
      const db = getDb();
      const [existing] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
      if (existing) {
        throw new ActionError({ code: "FORBIDDEN", message: "Instance is already set up" });
      }
      const ts = now();
      const userId = newId();
      const workspaceId = newId();
      await db.insert(schema.users).values({
        id: userId,
        email: input.email,
        name: input.name,
        password_hash: hashPassword(input.password),
        created_at: ts,
        updated_at: ts,
      });
      await db.insert(schema.workspaces).values({
        id: workspaceId,
        name: input.workspaceName,
        slug: input.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      await db.insert(schema.memberships).values({
        id: newId(),
        workspace_id: workspaceId,
        user_id: userId,
        role: "owner",
        created_at: ts,
      });
      await context.session?.set("userId", userId);
      return { ok: true };
    },
  }),

  login: defineAction({
    accept: "form",
    input: z.object({ email: z.string().email(), password: z.string() }),
    handler: async (input, context) => {
      const db = getDb();
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email));
      if (!user?.password_hash || !verifyPassword(input.password, user.password_hash)) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      await context.session?.set("userId", user.id);
      return { ok: true };
    },
  }),

  logout: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      context.session?.destroy();
      return { ok: true };
    },
  }),

  createProject: defineAction({
    accept: "form",
    input: z.object({ name: z.string().min(1), description: z.string().optional() }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const workspace = await getWorkspace(userId);
      const ts = now();
      const id = newId();
      await getDb()
        .insert(schema.projects)
        .values({
          id,
          workspace_id: workspace.id,
          name: input.name,
          slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || id,
          description: input.description || null,
          created_by: userId,
          created_at: ts,
          updated_at: ts,
        });
      return { id };
    },
  }),

  createIntent: defineAction({
    accept: "form",
    input: z.object({
      projectId: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const ts = now();
      const id = newId();
      await getDb()
        .insert(schema.intents)
        .values({
          id,
          project_id: input.projectId,
          title: input.title,
          description: input.description || null,
          created_by: userId,
          created_at: ts,
          updated_at: ts,
        });
      return { id };
    },
  }),

  createSpec: defineAction({
    accept: "form",
    input: z.object({ intentId: z.string(), title: z.string().min(1) }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const ts = now();
      const id = newId();
      await getDb().insert(schema.specs).values({
        id,
        intent_id: input.intentId,
        title: input.title,
        phase: "prd",
        status: "draft",
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      return { id };
    },
  }),

  saveVersion: defineAction({
    input: z.object({
      specId: z.string(),
      markdown: z.string(),
      summary: z.string().optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      if (spec.status === "frozen") {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Frozen specs are immutable — fork instead",
        });
      }
      const [latest] = await db
        .select()
        .from(schema.spec_versions)
        .where(eq(schema.spec_versions.spec_id, spec.id))
        .orderBy(desc(schema.spec_versions.number))
        .limit(1);
      const blocks = blocksFromMarkdown(input.markdown, latest?.blocks ?? []);
      const ts = now();
      const versionId = newId();
      const number = (latest?.number ?? 0) + 1;
      await db.insert(schema.spec_versions).values({
        id: versionId,
        spec_id: spec.id,
        number,
        parent_version_id: latest?.id ?? null,
        blocks,
        summary: input.summary || null,
        created_by: userId,
        ai_generated: false,
        created_at: ts,
      });
      await db
        .update(schema.specs)
        .set({ current_version_id: versionId, updated_at: ts })
        .where(eq(schema.specs.id, spec.id));
      return { number };
    },
  }),

  saveProviderConfig: defineAction({
    accept: "form",
    input: z.object({
      kind: z.enum(IMPLEMENTED_AI_PROVIDER_KINDS),
      name: z.string().min(1),
      model: z.string().min(1),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const workspace = await getWorkspace(userId);
      if (input.kind === "anthropic" && !input.apiKey) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Anthropic requires an API key" });
      }
      const ts = now();
      const id = newId();
      await getDb()
        .insert(schema.ai_provider_configs)
        .values({
          id,
          workspace_id: workspace.id,
          kind: input.kind,
          name: input.name,
          model: input.model,
          base_url: input.baseUrl || null,
          encrypted_credentials: input.apiKey
            ? await encryptSecret(input.apiKey, SPECPASA_SECRET)
            : null,
          enabled: true,
          created_at: ts,
          updated_at: ts,
        });
      return { id };
    },
  }),

  deleteProviderConfig: defineAction({
    accept: "form",
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      await requireUser(context);
      await getDb()
        .delete(schema.ai_provider_configs)
        .where(eq(schema.ai_provider_configs.id, input.id));
      return { ok: true };
    },
  }),
};

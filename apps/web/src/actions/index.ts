import { ActionError, defineAction } from "astro:actions";
import { SPECPASA_SECRET } from "astro:env/server";
import { z } from "zod";
import {
  blocksFromMarkdown,
  blocksToMarkdown,
  canAdvancePhase,
  canComment,
  canEdit,
  canManageMembers,
  canTransitionStatus,
  encryptSecret,
  forkInitialState,
  MEMBER_ROLES,
  newId,
  nextPhase,
  parseEpicsFromMarkdown,
  SPEC_STATUSES,
} from "@specpasa/core";
import {
  IntegrationError,
  type ExternalRecord,
  type TaskExportEpic,
} from "@specpasa/integrations";
import { IMPLEMENTED_AI_PROVIDER_KINDS } from "@specpasa/providers";
import { SUPPORTED_CLI_COMMANDS } from "@specpasa/providers/node";
import { getMembership, getWorkspace, hashPassword, verifyPassword } from "../lib/auth";
import { specInWorkspace, threadSpecInWorkspace } from "../lib/authz";
import { getDb, insertSpecVersion, schema, and, desc, eq } from "../lib/db";
import { buildSink, getGitHubIntegration, getSpecContext, withSpecLock } from "../lib/integrations";
import { publishCommentsChanged } from "../lib/realtime";
import { t } from "../lib/strings";

const now = () => Date.now();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireUser(context: { session?: { get(key: string): Promise<unknown> } }) {
  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) throw new ActionError({ code: "UNAUTHORIZED", message: "Sign in first" });
  return userId;
}

/** requireUser + editor-level role (FR-TEN-4): every content/config mutation.
 * Commenter/viewer roles may only read and use the comment actions below. */
async function requireEditor(context: { session?: { get(key: string): Promise<unknown> } }) {
  const userId = await requireUser(context);
  const { role } = await getMembership(userId);
  if (!canEdit(role)) {
    throw new ActionError({ code: "FORBIDDEN", message: "Your role cannot edit specs" });
  }
  return userId;
}

/** Per-kind requirements (mirrors the factory's ProviderConfigError guards). */
function validateProviderInput(input: {
  kind: string;
  apiKey?: string;
  model?: string;
  cliCommand?: string;
}): void {
  if (input.kind === "anthropic" && !input.apiKey) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Anthropic requires an API key" });
  }
  if ((input.kind === "anthropic" || input.kind === "ollama") && !input.model) {
    throw new ActionError({ code: "BAD_REQUEST", message: "This provider requires a model" });
  }
  if (input.kind === "local_cli" && !input.cliCommand) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Pick which CLI to use" });
  }
}

/** Frozen-spec + connected-sink guard shared by the export actions (M4). */
async function resolveExportTarget(specId: string, opts: { tasksPhase?: boolean } = {}) {
  const specContext = await getSpecContext(specId);
  if (!specContext) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
  const { spec, project } = specContext;
  if (opts.tasksPhase && spec.phase !== "tasks") {
    throw new ActionError({ code: "BAD_REQUEST", message: t.export.tasksOnly });
  }
  if (spec.status !== "frozen" || !spec.current_version_id) {
    throw new ActionError({ code: "BAD_REQUEST", message: t.export.needsFrozen });
  }
  const integration = await getGitHubIntegration(project.id);
  const sink = integration ? await buildSink(integration) : null;
  if (!integration || !sink) {
    throw new ActionError({ code: "BAD_REQUEST", message: t.export.needsIntegration });
  }
  return { spec, integration, sink };
}

/** Surface IntegrationError as a user-facing action error. */
async function runSink<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof IntegrationError) {
      throw new ActionError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

async function collectExportEpics(
  versionId: string,
  integrationId: string,
): Promise<TaskExportEpic[]> {
  const db = getDb();
  const epics = await db
    .select()
    .from(schema.epics)
    .where(eq(schema.epics.spec_version_id, versionId))
    .orderBy(schema.epics.position);
  if (!epics.length) {
    throw new ActionError({ code: "BAD_REQUEST", message: t.export.epicsEmpty });
  }
  const result: TaskExportEpic[] = [];
  for (const epic of epics) {
    const tasks = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.epic_id, epic.id))
      .orderBy(schema.tasks.position);
    const [prior] = await db
      .select({ external_id: schema.export_records.external_id })
      .from(schema.export_records)
      .where(
        and(
          eq(schema.export_records.epic_id, epic.id),
          eq(schema.export_records.integration_id, integrationId),
        ),
      );
    result.push({
      epicId: epic.id,
      title: epic.title,
      description: epic.description,
      tasks: tasks.map((task) => ({
        taskId: task.id,
        title: task.title,
        description: task.description,
      })),
      priorExternalId: prior?.external_id ?? null,
    });
  }
  return result;
}

interface UpsertExportArgs {
  integration_id: string;
  spec_version_id: string;
  epic_id?: string;
  external_kind: "document" | "issue";
  record: ExternalRecord;
  userId: string;
}

/** Idempotent export ledger (FR-INT-7): update the prior row when one exists. */
async function upsertExportRecord(priorId: string | null, args: UpsertExportArgs) {
  const db = getDb();
  const ts = now();
  if (priorId) {
    await db
      .update(schema.export_records)
      .set({
        spec_version_id: args.spec_version_id,
        external_id: args.record.externalId,
        external_url: args.record.externalUrl,
        exported_by: args.userId,
        exported_at: ts,
      })
      .where(eq(schema.export_records.id, priorId));
    return;
  }
  await db.insert(schema.export_records).values({
    id: newId(),
    integration_id: args.integration_id,
    spec_version_id: args.spec_version_id,
    ...(args.epic_id ? { epic_id: args.epic_id } : {}),
    external_kind: args.external_kind,
    external_id: args.record.externalId,
    external_url: args.record.externalUrl,
    exported_by: args.userId,
    exported_at: ts,
  });
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
      const userId = await requireEditor(context);
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
      const userId = await requireEditor(context);
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
      const userId = await requireEditor(context);
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
      const userId = await requireEditor(context);
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
      // Race-safe append: concurrent editors both computing latest+1 collide
      // on the unique (spec_id, number); the helper re-reads and retries.
      const { number } = await insertSpecVersion(db, schema, {
        specId: spec.id,
        blocks,
        summary: input.summary || null,
        createdBy: userId,
      });
      return { number };
    },
  }),

  saveProviderConfig: defineAction({
    accept: "form",
    input: z.object({
      kind: z.enum(IMPLEMENTED_AI_PROVIDER_KINDS),
      name: z.string().min(1),
      model: z.string().optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      cliCommand: z.enum(SUPPORTED_CLI_COMMANDS).optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const workspace = await getWorkspace(userId);
      validateProviderInput(input);
      const ts = now();
      const id = newId();
      await getDb()
        .insert(schema.ai_provider_configs)
        .values({
          id,
          workspace_id: workspace.id,
          kind: input.kind,
          name: input.name,
          model: input.model || null,
          base_url: input.baseUrl || null,
          cli_command: input.cliCommand || null,
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
      await requireEditor(context);
      await getDb()
        .delete(schema.ai_provider_configs)
        .where(eq(schema.ai_provider_configs.id, input.id));
      return { ok: true };
    },
  }),

  transitionSpecStatus: defineAction({
    accept: "form",
    input: z.object({ specId: z.string(), to: z.enum(SPEC_STATUSES) }),
    handler: async (input, context) => {
      await requireEditor(context);
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      if (!canTransitionStatus(spec.status, input.to)) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: `Illegal transition ${spec.status} → ${input.to}`,
        });
      }
      if (input.to === "frozen" && !spec.current_version_id) {
        throw new ActionError({ code: "BAD_REQUEST", message: t.lifecycle.freezeNeedsVersion });
      }
      const ts = now();
      await db
        .update(schema.specs)
        .set({
          status: input.to,
          frozen_at: input.to === "frozen" ? ts : null,
          updated_at: ts,
        })
        .where(eq(schema.specs.id, spec.id));
      return { status: input.to };
    },
  }),

  advancePhase: defineAction({
    accept: "form",
    input: z.object({ specId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      const phase = nextPhase(spec.phase);
      if (!canAdvancePhase(spec) || !phase) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Only a frozen spec with a next phase can advance",
        });
      }
      const [frozenVersion] = await db
        .select()
        .from(schema.spec_versions)
        .where(eq(schema.spec_versions.id, spec.current_version_id!));
      const ts = now();
      const specId = newId();
      const versionId = newId();
      const seed = [
        t.lifecycle.seedHeading(spec.title, phase),
        t.lifecycle.seedNote(spec.phase, frozenVersion?.number ?? 0),
      ].join("\n\n");
      await db.insert(schema.specs).values({
        id: specId,
        intent_id: spec.intent_id,
        title: spec.title,
        phase,
        status: "draft",
        derived_from_spec_id: spec.id,
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      await db.insert(schema.spec_versions).values({
        id: versionId,
        spec_id: specId,
        number: 1,
        blocks: blocksFromMarkdown(seed),
        summary: t.lifecycle.derivedFrom(spec.phase),
        created_by: userId,
        ai_generated: false,
        created_at: ts,
      });
      await db
        .update(schema.specs)
        .set({ current_version_id: versionId })
        .where(eq(schema.specs.id, specId));
      // The frozen source rides along as a spec reference so AI drafts in the
      // new phase see it as context (FR-LIFE-4, FR-AI-8).
      await db.insert(schema.spec_references).values({
        id: newId(),
        spec_id: specId,
        kind: "spec",
        title: `${spec.title} (${spec.phase.toUpperCase()}, frozen)`,
        payload: { spec_id: spec.id },
        created_by: userId,
        created_at: ts,
      });
      return { id: specId };
    },
  }),

  forkSpec: defineAction({
    accept: "form",
    input: z.object({ versionId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const [version] = await db
        .select()
        .from(schema.spec_versions)
        .where(eq(schema.spec_versions.id, input.versionId));
      if (!version) throw new ActionError({ code: "NOT_FOUND", message: "Version not found" });
      const [source] = await db
        .select()
        .from(schema.specs)
        .where(eq(schema.specs.id, version.spec_id));
      if (!source) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      const initial = forkInitialState(source.phase);
      const ts = now();
      const specId = newId();
      const versionId = newId();
      await db.insert(schema.specs).values({
        id: specId,
        intent_id: source.intent_id,
        title: t.lifecycle.forkTitle(source.title),
        phase: initial.phase,
        status: initial.status,
        forked_from_version_id: version.id,
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      // Blocks are copied verbatim: stable block IDs preserve lineage (ADR-5).
      await db.insert(schema.spec_versions).values({
        id: versionId,
        spec_id: specId,
        number: 1,
        blocks: version.blocks,
        summary: `Forked from v${version.number} of "${source.title}"`,
        created_by: userId,
        ai_generated: false,
        created_at: ts,
      });
      await db
        .update(schema.specs)
        .set({ current_version_id: versionId })
        .where(eq(schema.specs.id, specId));
      return { id: specId };
    },
  }),

  addReference: defineAction({
    accept: "form",
    input: z.object({
      specId: z.string(),
      kind: z.enum(["url", "github_code", "spec"]),
      title: z.string().min(1),
      target: z.string().min(1),
    }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      if (input.kind === "spec") {
        const [target] = await db
          .select({ id: schema.specs.id })
          .from(schema.specs)
          .where(eq(schema.specs.id, input.target.trim()));
        if (!target) throw new ActionError({ code: "BAD_REQUEST", message: "Spec ID not found" });
      }
      const isLink = input.kind === "url" || input.kind === "github_code";
      if (isLink && !/^https?:\/\//.test(input.target.trim())) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Enter an http(s) URL" });
      }
      await db.insert(schema.spec_references).values({
        id: newId(),
        spec_id: spec.id,
        kind: input.kind,
        title: input.title,
        url: isLink ? input.target.trim() : null,
        payload: input.kind === "spec" ? { spec_id: input.target.trim() } : null,
        created_by: userId,
        created_at: now(),
      });
      return { ok: true };
    },
  }),

  deleteReference: defineAction({
    accept: "form",
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      await requireEditor(context);
      await getDb().delete(schema.spec_references).where(eq(schema.spec_references.id, input.id));
      return { ok: true };
    },
  }),

  inviteMember: defineAction({
    accept: "form",
    input: z.object({ email: z.string().email(), role: z.enum(MEMBER_ROLES) }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const { workspace, role } = await getMembership(userId);
      if (!canManageMembers(role)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Only owners can invite members" });
      }
      const ts = now();
      const token = newId();
      await getDb()
        .insert(schema.invites)
        .values({
          id: newId(),
          workspace_id: workspace.id,
          email: input.email,
          role: input.role,
          token,
          invited_by: userId,
          expires_at: ts + INVITE_TTL_MS,
          created_at: ts,
        });
      return { token };
    },
  }),

  acceptInvite: defineAction({
    accept: "form",
    input: z.object({ token: z.string(), name: z.string().min(1), password: z.string().min(8) }),
    handler: async (input, context) => {
      const db = getDb();
      const [invite] = await db
        .select()
        .from(schema.invites)
        .where(eq(schema.invites.token, input.token));
      if (!invite || invite.accepted_at || invite.expires_at < now()) {
        throw new ActionError({ code: "NOT_FOUND", message: "Invite is invalid or expired" });
      }
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, invite.email));
      if (existing) {
        throw new ActionError({
          code: "CONFLICT",
          message: "An account with this email already exists — log in instead",
        });
      }
      const ts = now();
      const userId = newId();
      await db.insert(schema.users).values({
        id: userId,
        email: invite.email,
        name: input.name,
        password_hash: hashPassword(input.password),
        created_at: ts,
        updated_at: ts,
      });
      await db.insert(schema.memberships).values({
        id: newId(),
        workspace_id: invite.workspace_id,
        user_id: userId,
        role: invite.role,
        created_at: ts,
      });
      await db
        .update(schema.invites)
        .set({ accepted_at: ts })
        .where(eq(schema.invites.id, invite.id));
      await context.session?.set("userId", userId);
      return { ok: true };
    },
  }),

  createThread: defineAction({
    input: z.object({
      specId: z.string(),
      blockId: z.string(),
      body: z.string().min(1),
    }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const { workspace, role } = await getMembership(userId);
      if (!canComment(role)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Your role cannot comment" });
      }
      // Object-level authz: spec must resolve into the caller's workspace.
      if (!(await specInWorkspace(input.specId, workspace.id))) {
        throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      }
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      if (!spec.current_version_id) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Save a version before commenting" });
      }
      const ts = now();
      const threadId = newId();
      await db.insert(schema.comment_threads).values({
        id: threadId,
        spec_id: spec.id,
        block_id: input.blockId,
        created_on_version_id: spec.current_version_id,
        created_by: userId,
        created_at: ts,
      });
      await db.insert(schema.comments).values({
        id: newId(),
        thread_id: threadId,
        author_id: userId,
        body: input.body,
        created_at: ts,
        updated_at: ts,
      });
      publishCommentsChanged(spec.id);
      return { threadId };
    },
  }),

  replyThread: defineAction({
    input: z.object({ threadId: z.string(), body: z.string().min(1) }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const { workspace, role } = await getMembership(userId);
      if (!canComment(role)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Your role cannot comment" });
      }
      const db = getDb();
      // Object-level authz: thread must resolve into the caller's workspace.
      const threadSpecId = await threadSpecInWorkspace(input.threadId, workspace.id);
      if (!threadSpecId) throw new ActionError({ code: "NOT_FOUND", message: "Thread not found" });
      const ts = now();
      await db.insert(schema.comments).values({
        id: newId(),
        thread_id: input.threadId,
        author_id: userId,
        body: input.body,
        created_at: ts,
        updated_at: ts,
      });
      publishCommentsChanged(threadSpecId);
      return { ok: true };
    },
  }),

  setThreadResolved: defineAction({
    input: z.object({ threadId: z.string(), resolved: z.boolean() }),
    handler: async (input, context) => {
      const userId = await requireUser(context);
      const { workspace, role } = await getMembership(userId);
      if (!canComment(role)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Your role cannot resolve threads" });
      }
      const db = getDb();
      // Object-level authz: thread must resolve into the caller's workspace.
      const resolvedSpecId = await threadSpecInWorkspace(input.threadId, workspace.id);
      if (!resolvedSpecId) throw new ActionError({ code: "NOT_FOUND", message: "Thread not found" });
      await db
        .update(schema.comment_threads)
        .set(
          input.resolved
            ? { resolved_at: now(), resolved_by: userId }
            : { resolved_at: null, resolved_by: null },
        )
        .where(eq(schema.comment_threads.id, input.threadId));
      publishCommentsChanged(resolvedSpecId);
      return { ok: true };
    },
  }),

  saveIntegration: defineAction({
    accept: "form",
    input: z.object({
      projectId: z.string(),
      owner: z.string().min(1),
      repo: z.string().min(1),
      branch: z.string().optional(),
      basePath: z.string().optional(),
      token: z.string().min(1),
    }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const ts = now();
      const config = {
        owner: input.owner.trim(),
        repo: input.repo.trim(),
        branch: input.branch?.trim() || undefined,
        basePath: input.basePath?.trim() || undefined,
      };
      const encrypted = await encryptSecret(input.token, SPECPASA_SECRET);
      const existing = await getGitHubIntegration(input.projectId);
      if (existing) {
        await db
          .update(schema.integrations)
          .set({ config, encrypted_credentials: encrypted, updated_at: ts })
          .where(eq(schema.integrations.id, existing.id));
        return { id: existing.id };
      }
      const id = newId();
      await db.insert(schema.integrations).values({
        id,
        project_id: input.projectId,
        kind: "github",
        name: `${config.owner}/${config.repo}`,
        config,
        encrypted_credentials: encrypted,
        created_by: userId,
        created_at: ts,
        updated_at: ts,
      });
      return { id };
    },
  }),

  deleteIntegration: defineAction({
    accept: "form",
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      await requireEditor(context);
      const db = getDb();
      await db
        .delete(schema.export_records)
        .where(eq(schema.export_records.integration_id, input.id));
      await db.delete(schema.integrations).where(eq(schema.integrations.id, input.id));
      return { ok: true };
    },
  }),

  structureEpics: defineAction({
    accept: "form",
    input: z.object({ specId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const [spec] = await db.select().from(schema.specs).where(eq(schema.specs.id, input.specId));
      if (!spec) throw new ActionError({ code: "NOT_FOUND", message: "Spec not found" });
      if (spec.phase !== "tasks") {
        throw new ActionError({ code: "BAD_REQUEST", message: t.export.tasksOnly });
      }
      if (!spec.current_version_id) {
        throw new ActionError({ code: "BAD_REQUEST", message: t.editor.blankSpec });
      }
      return withSpecLock(spec.id, async () => {
        const [version] = await db
          .select()
          .from(schema.spec_versions)
          .where(eq(schema.spec_versions.id, spec.current_version_id!));
        if (!version) {
          throw new ActionError({ code: "NOT_FOUND", message: "Spec version not found" });
        }
        const parsed = parseEpicsFromMarkdown(blocksToMarkdown(version.blocks));
        // Re-structuring replaces the previous grouping for this version.
        // Old epics' ledger rows must go with them — otherwise re-export
        // reuses issue numbers that no longer map to any epic. The GitHub
        // issues created from the old structure remain on GitHub; the UI
        // surfaces how many were replaced so re-export intent is explicit.
        const stale = await db
          .select({ id: schema.epics.id })
          .from(schema.epics)
          .where(eq(schema.epics.spec_version_id, version.id));
        let replacedIssues = 0;
        for (const epic of stale) {
          const deleted = await db
            .delete(schema.export_records)
            .where(eq(schema.export_records.epic_id, epic.id))
            .returning({ id: schema.export_records.id });
          replacedIssues += deleted.length;
          await db.delete(schema.tasks).where(eq(schema.tasks.epic_id, epic.id));
        }
        await db.delete(schema.epics).where(eq(schema.epics.spec_version_id, version.id));
        const ts = now();
        let position = 0;
        for (const epic of parsed) {
          const epicId = newId();
          await db.insert(schema.epics).values({
            id: epicId,
            spec_version_id: version.id,
            title: epic.title,
            description: epic.description,
            position: position++,
            created_at: ts,
          });
          let taskPosition = 0;
          for (const task of epic.tasks) {
            await db.insert(schema.tasks).values({
              id: newId(),
              epic_id: epicId,
              spec_version_id: version.id,
              title: task.title,
              description: task.description,
              position: taskPosition++,
              created_at: ts,
            });
          }
        }
        void userId;
        return { epics: parsed.length, replacedIssues };
      });
    },
  }),

  deleteEpic: defineAction({
    accept: "form",
    input: z.object({ epicId: z.string() }),
    handler: async (input, context) => {
      await requireEditor(context);
      const db = getDb();
      await db.delete(schema.export_records).where(eq(schema.export_records.epic_id, input.epicId));
      await db.delete(schema.tasks).where(eq(schema.tasks.epic_id, input.epicId));
      await db.delete(schema.epics).where(eq(schema.epics.id, input.epicId));
      return { ok: true };
    },
  }),

  exportDocument: defineAction({
    accept: "form",
    input: z.object({ specId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const { spec, integration, sink } = await resolveExportTarget(input.specId);
      if (!sink.exportDocument) {
        throw new ActionError({ code: "BAD_REQUEST", message: t.export.needsIntegration });
      }
      return withSpecLock(spec.id, async () => {
        const [version] = await db
          .select()
          .from(schema.spec_versions)
          .where(eq(schema.spec_versions.id, spec.current_version_id!));
        if (!version) {
          throw new ActionError({ code: "NOT_FOUND", message: "Spec version not found" });
        }
        // One document ledger row per spec+integration; its recorded path is
        // reused so a renamed spec keeps updating the same file.
        const [prior] = await db
          .select({
            id: schema.export_records.id,
            external_id: schema.export_records.external_id,
          })
          .from(schema.export_records)
          .innerJoin(
            schema.spec_versions,
            eq(schema.export_records.spec_version_id, schema.spec_versions.id),
          )
          .where(
            and(
              eq(schema.spec_versions.spec_id, spec.id),
              eq(schema.export_records.integration_id, integration.id),
              eq(schema.export_records.external_kind, "document"),
            ),
          );
        const records = await runSink(() =>
          sink.exportDocument!({
            title: spec.title,
            markdown: blocksToMarkdown(version.blocks),
            specId: spec.id,
            versionNumber: version.number,
            path: prior?.external_id ?? null,
          }),
        );
        for (const record of records) {
          await upsertExportRecord(prior?.id ?? null, {
            integration_id: integration.id,
            spec_version_id: version.id,
            external_kind: "document",
            record,
            userId,
          });
        }
        return { exported: records.length };
      });
    },
  }),

  exportTasks: defineAction({
    accept: "form",
    input: z.object({ specId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireEditor(context);
      const db = getDb();
      const { spec, integration, sink } = await resolveExportTarget(input.specId, {
        tasksPhase: true,
      });
      if (!sink.createTasks) {
        throw new ActionError({ code: "BAD_REQUEST", message: t.export.needsIntegration });
      }
      return withSpecLock(spec.id, async () => {
        const exportEpics = await collectExportEpics(spec.current_version_id!, integration.id);
        const records = await runSink(() =>
          sink.createTasks!({ specTitle: spec.title, epics: exportEpics }),
        );
        for (const record of records) {
          const [prior] = await db
            .select({ id: schema.export_records.id })
            .from(schema.export_records)
            .where(
              and(
                eq(schema.export_records.epic_id, record.internalId),
                eq(schema.export_records.integration_id, integration.id),
              ),
            );
          await upsertExportRecord(prior?.id ?? null, {
            integration_id: integration.id,
            spec_version_id: spec.current_version_id!,
            epic_id: record.internalId,
            external_kind: "issue",
            record,
            userId,
          });
        }
        return { exported: records.length };
      });
    },
  }),
};

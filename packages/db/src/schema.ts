import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  AI_PROVIDER_KINDS,
  INTEGRATION_KINDS,
  MEMBER_ROLES,
  REFERENCE_KINDS,
  SPEC_PHASES,
  SPEC_STATUSES,
  TEMPLATE_KINDS,
  type SpecBlock,
} from "@specpasa/core";

// Source of truth: docs/domain-model.md. Conventions (ADR-3): text ULID PKs
// generated in the app layer, unix-ms integer timestamps, JSON stored as
// text, no dialect-specific features so the schema stays portable across
// SQLite (default), Postgres (optional), and D1 (Cloudflare).

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at").notNull();
const updatedAt = () => integer("updated_at").notNull();

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  password_hash: text("password_hash"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Workspace preferences (e.g. auto_detect: false turns off local AI
  // probing/auto-provisioning). Absent keys mean the default behavior.
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: id(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("memberships_workspace_user_uk").on(t.workspace_id, t.user_id)],
);

export const invites = sqliteTable("invites", {
  id: id(),
  workspace_id: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  email: text("email").notNull(),
  role: text("role", { enum: MEMBER_ROLES }).notNull(),
  token: text("token").notNull().unique(),
  invited_by: text("invited_by")
    .notNull()
    .references(() => users.id),
  expires_at: integer("expires_at").notNull(),
  accepted_at: integer("accepted_at"),
  created_at: createdAt(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [uniqueIndex("projects_workspace_slug_uk").on(t.workspace_id, t.slug)],
);

export const project_members = sqliteTable(
  "project_members",
  {
    id: id(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("project_members_project_user_uk").on(t.project_id, t.user_id)],
);

export const intents = sqliteTable("intents", {
  id: id(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const ai_provider_configs = sqliteTable("ai_provider_configs", {
  id: id(),
  // Scoped to exactly one of workspace or user (enforced in the app layer;
  // portable CHECK constraints land with the first real migration review).
  workspace_id: text("workspace_id").references(() => workspaces.id),
  user_id: text("user_id").references(() => users.id),
  kind: text("kind", { enum: AI_PROVIDER_KINDS }).notNull(),
  name: text("name").notNull(),
  base_url: text("base_url"),
  model: text("model"),
  cli_command: text("cli_command"),
  encrypted_credentials: text("encrypted_credentials"),
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const specs = sqliteTable(
  "specs",
  {
    id: id(),
    intent_id: text("intent_id")
      .notNull()
      .references(() => intents.id),
    title: text("title").notNull(),
    phase: text("phase", { enum: SPEC_PHASES }).notNull(),
    status: text("status", { enum: SPEC_STATUSES }).notNull().default("draft"),
    // No hard FK: circular reference with spec_versions.spec_id.
    current_version_id: text("current_version_id"),
    forked_from_version_id: text("forked_from_version_id"),
    derived_from_spec_id: text("derived_from_spec_id"),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    // Working draft buffer (#32): autosaved edits that are NOT yet a
    // version. Cleared when a version is saved. Last-writer-wins until the
    // CRDT layer lands (ADR-5).
    draft_markdown: text("draft_markdown"),
    draft_saved_at: integer("draft_saved_at"),
    draft_saved_by: text("draft_saved_by").references(() => users.id),
    frozen_at: integer("frozen_at"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("specs_intent_idx").on(t.intent_id)],
);

// Workspace-authored document templates. Built-in standard templates live in
// code (apps/web/src/lib/templates.ts), not here — only customs and edited
// copies are rows. At most one default per (workspace, kind), app-enforced.
export const spec_templates = sqliteTable(
  "spec_templates",
  {
    id: id(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind", { enum: TEMPLATE_KINDS }).notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    is_default: integer("is_default", { mode: "boolean" }).notNull().default(false),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("spec_templates_workspace_kind_idx").on(t.workspace_id, t.kind)],
);

export const spec_versions = sqliteTable(
  "spec_versions",
  {
    id: id(),
    spec_id: text("spec_id")
      .notNull()
      .references(() => specs.id),
    number: integer("number").notNull(),
    parent_version_id: text("parent_version_id"),
    // Immutable once written: iteration always appends a new version.
    blocks: text("blocks", { mode: "json" }).$type<SpecBlock[]>().notNull(),
    summary: text("summary"),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ai_generated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
    ai_provider_config_id: text("ai_provider_config_id").references(() => ai_provider_configs.id),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("spec_versions_spec_number_uk").on(t.spec_id, t.number)],
);

export const comment_threads = sqliteTable(
  "comment_threads",
  {
    id: id(),
    spec_id: text("spec_id")
      .notNull()
      .references(() => specs.id),
    // Anchored to a stable block ULID so the thread survives new versions.
    block_id: text("block_id").notNull(),
    created_on_version_id: text("created_on_version_id")
      .notNull()
      .references(() => spec_versions.id),
    text_range: text("text_range", { mode: "json" }).$type<{
      start: number;
      end: number;
      quote: string;
    }>(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    resolved_at: integer("resolved_at"),
    resolved_by: text("resolved_by").references(() => users.id),
    created_at: createdAt(),
  },
  (t) => [index("comment_threads_spec_block_idx").on(t.spec_id, t.block_id)],
);

export const comments = sqliteTable("comments", {
  id: id(),
  thread_id: text("thread_id")
    .notNull()
    .references(() => comment_threads.id),
  author_id: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// "references" is an SQL keyword; table intentionally named spec_references.
export const spec_references = sqliteTable("spec_references", {
  id: id(),
  spec_id: text("spec_id")
    .notNull()
    .references(() => specs.id),
  kind: text("kind", { enum: REFERENCE_KINDS }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
});

export const integrations = sqliteTable("integrations", {
  id: id(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  kind: text("kind", { enum: INTEGRATION_KINDS }).notNull(),
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  encrypted_credentials: text("encrypted_credentials"),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const epics = sqliteTable("epics", {
  id: id(),
  spec_version_id: text("spec_version_id")
    .notNull()
    .references(() => spec_versions.id),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull(),
  created_at: createdAt(),
});

export const tasks = sqliteTable("tasks", {
  id: id(),
  epic_id: text("epic_id")
    .notNull()
    .references(() => epics.id),
  spec_version_id: text("spec_version_id")
    .notNull()
    .references(() => spec_versions.id),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull(),
  estimate: text("estimate"),
  labels: text("labels", { mode: "json" }).$type<string[]>(),
  created_at: createdAt(),
});

export const export_records = sqliteTable("export_records", {
  id: id(),
  integration_id: text("integration_id")
    .notNull()
    .references(() => integrations.id),
  spec_version_id: text("spec_version_id")
    .notNull()
    .references(() => spec_versions.id),
  epic_id: text("epic_id").references(() => epics.id),
  task_id: text("task_id").references(() => tasks.id),
  external_kind: text("external_kind", {
    enum: ["issue", "ticket", "story", "document", "file"],
  }).notNull(),
  external_id: text("external_id").notNull(),
  external_url: text("external_url"),
  exported_by: text("exported_by")
    .notNull()
    .references(() => users.id),
  exported_at: integer("exported_at").notNull(),
});

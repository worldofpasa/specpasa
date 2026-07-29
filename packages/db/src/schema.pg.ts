import {
  bigint,
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

// Postgres mirror of ./schema.ts (the SQLite source of truth) — ADR-3.
// Same tables, columns, nullability, defaults, and enum lists; only the
// storage types differ within the portable subset:
//   sqlite integer (unix-ms)      -> pg bigint  { mode: "number" }
//   sqlite integer { mode: bool } -> pg boolean
//   sqlite text    { mode: json } -> pg json (same app-level object contract)
// The parity test in ../test/parity.test.ts fails the build on any drift.
// Do not add pg-only features here (no pg enums, JSONB operators, triggers).

const id = () => text("id").primaryKey();
const createdAt = () => bigint("created_at", { mode: "number" }).notNull();
const updatedAt = () => bigint("updated_at", { mode: "number" }).notNull();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  password_hash: text("password_hash"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const memberships = pgTable(
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

export const invites = pgTable("invites", {
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
  expires_at: bigint("expires_at", { mode: "number" }).notNull(),
  accepted_at: bigint("accepted_at", { mode: "number" }),
  created_at: createdAt(),
});

export const projects = pgTable(
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

export const project_members = pgTable(
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

export const intents = pgTable("intents", {
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

export const ai_provider_configs = pgTable("ai_provider_configs", {
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
  settings: json("settings").$type<Record<string, unknown>>(),
  enabled: boolean("enabled").notNull().default(true),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const specs = pgTable(
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
    draft_saved_at: bigint("draft_saved_at", { mode: "number" }),
    draft_saved_by: text("draft_saved_by").references(() => users.id),
    frozen_at: bigint("frozen_at", { mode: "number" }),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("specs_intent_idx").on(t.intent_id)],
);

export const spec_templates = pgTable(
  "spec_templates",
  {
    id: id(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind", { enum: TEMPLATE_KINDS }).notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    is_default: boolean("is_default").notNull().default(false),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [index("spec_templates_workspace_kind_idx").on(t.workspace_id, t.kind)],
);

export const spec_versions = pgTable(
  "spec_versions",
  {
    id: id(),
    spec_id: text("spec_id")
      .notNull()
      .references(() => specs.id),
    number: integer("number").notNull(),
    parent_version_id: text("parent_version_id"),
    // Immutable once written: iteration always appends a new version.
    blocks: json("blocks").$type<SpecBlock[]>().notNull(),
    summary: text("summary"),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    ai_generated: boolean("ai_generated").notNull().default(false),
    ai_provider_config_id: text("ai_provider_config_id").references(() => ai_provider_configs.id),
    created_at: createdAt(),
  },
  (t) => [uniqueIndex("spec_versions_spec_number_uk").on(t.spec_id, t.number)],
);

export const comment_threads = pgTable(
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
    text_range: json("text_range").$type<{
      start: number;
      end: number;
      quote: string;
    }>(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    resolved_at: bigint("resolved_at", { mode: "number" }),
    resolved_by: text("resolved_by").references(() => users.id),
    created_at: createdAt(),
  },
  (t) => [index("comment_threads_spec_block_idx").on(t.spec_id, t.block_id)],
);

export const comments = pgTable("comments", {
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
export const spec_references = pgTable("spec_references", {
  id: id(),
  spec_id: text("spec_id")
    .notNull()
    .references(() => specs.id),
  kind: text("kind", { enum: REFERENCE_KINDS }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  payload: json("payload").$type<Record<string, unknown>>(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
});

export const integrations = pgTable("integrations", {
  id: id(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  kind: text("kind", { enum: INTEGRATION_KINDS }).notNull(),
  name: text("name").notNull(),
  config: json("config").$type<Record<string, unknown>>().notNull(),
  encrypted_credentials: text("encrypted_credentials"),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const epics = pgTable("epics", {
  id: id(),
  spec_version_id: text("spec_version_id")
    .notNull()
    .references(() => spec_versions.id),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull(),
  created_at: createdAt(),
});

export const tasks = pgTable("tasks", {
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
  labels: json("labels").$type<string[]>(),
  created_at: createdAt(),
});

export const export_records = pgTable("export_records", {
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
  exported_at: bigint("exported_at", { mode: "number" }).notNull(),
});

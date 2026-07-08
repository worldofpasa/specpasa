import { SPECPASA_SECRET } from "astro:env/server";
import { decryptSecret } from "@specpasa/core";
import { createGitHubSink, type IntegrationSink } from "@specpasa/integrations";
import { and, eq, getDb, schema } from "./db";

export interface GitHubIntegrationConfig {
  owner: string;
  repo: string;
  branch?: string;
  basePath?: string;
}

/** Spec with its intent and project — exports are configured per project. */
export async function getSpecContext(specId: string) {
  const db = getDb();
  const [row] = await db
    .select({ spec: schema.specs, intent: schema.intents, project: schema.projects })
    .from(schema.specs)
    .innerJoin(schema.intents, eq(schema.specs.intent_id, schema.intents.id))
    .innerJoin(schema.projects, eq(schema.intents.project_id, schema.projects.id))
    .where(eq(schema.specs.id, specId));
  return row ?? null;
}

export async function getGitHubIntegration(projectId: string) {
  const db = getDb();
  const [integration] = await db
    .select()
    .from(schema.integrations)
    .where(
      and(eq(schema.integrations.project_id, projectId), eq(schema.integrations.kind, "github")),
    );
  return integration ?? null;
}

/**
 * Serialize structure/export mutations per spec so a double-click can't
 * interleave read-then-insert ledger writes (duplicate issues/rows).
 * In-process only — multi-process deployments need a db-level unique
 * constraint, deferred while the schema is frozen (documented in the PR).
 */
const specLocks = new Map<string, Promise<unknown>>();

export function withSpecLock<T>(specId: string, operation: () => Promise<T>): Promise<T> {
  const previous = specLocks.get(specId) ?? Promise.resolve();
  const run = previous.then(operation, operation);
  specLocks.set(
    specId,
    run.catch(() => undefined),
  );
  return run;
}

export async function buildSink(
  integration: typeof schema.integrations.$inferSelect,
): Promise<IntegrationSink | null> {
  if (integration.kind !== "github" || !integration.encrypted_credentials) return null;
  const token = await decryptSecret(integration.encrypted_credentials, SPECPASA_SECRET);
  const config = integration.config as unknown as GitHubIntegrationConfig;
  return createGitHubSink({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch || undefined,
    basePath: config.basePath || undefined,
    token,
  });
}

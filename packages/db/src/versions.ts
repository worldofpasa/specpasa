import { desc, eq } from "drizzle-orm";
import { newId, type SpecBlock } from "@specpasa/core";
import type { Db, Schema } from "./index.js";

export interface NewSpecVersionInput {
  specId: string;
  blocks: SpecBlock[];
  summary?: string | null;
  createdBy: string;
  aiGenerated?: boolean;
  aiProviderConfigId?: string | null;
}

/** Dialect-aware unique-violation detector: postgres-js surfaces SQLSTATE
 * 23505; libsql surfaces SQLITE_CONSTRAINT / "UNIQUE constraint failed". */
export function isUniqueViolation(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; cause?: unknown };
  const cause = (e.cause ?? {}) as { code?: unknown; message?: unknown };
  const haystack = [e.code, e.message, cause.code, cause.message]
    .map((part) => String(part ?? ""))
    .join(" ");
  return /23505|SQLITE_CONSTRAINT|unique constraint/i.test(haystack);
}

interface InsertHooks {
  /** Test seam: runs between the latest-version read and the insert. */
  beforeInsert?: (attempt: number) => Promise<void> | void;
}

type LatestVersion = { id: string; number: number } | undefined;

async function readLatest(db: Db, schema: Schema, specId: string): Promise<LatestVersion> {
  const [latest] = await db
    .select({ id: schema.spec_versions.id, number: schema.spec_versions.number })
    .from(schema.spec_versions)
    .where(eq(schema.spec_versions.spec_id, specId))
    .orderBy(desc(schema.spec_versions.number))
    .limit(1);
  return latest;
}

function versionRow(input: NewSpecVersionInput, latest: LatestVersion, ts: number) {
  return {
    id: newId(),
    spec_id: input.specId,
    number: (latest?.number ?? 0) + 1,
    parent_version_id: latest?.id ?? null,
    blocks: input.blocks,
    summary: input.summary ?? null,
    created_by: input.createdBy,
    ai_generated: input.aiGenerated ?? false,
    ai_provider_config_id: input.aiProviderConfigId ?? null,
    created_at: ts,
  };
}

/**
 * Append an immutable spec version with a race-safe number. Two concurrent
 * writers both compute latest+1; the loser hits spec_versions_spec_number_uk.
 * We re-read the latest INSIDE each attempt and retry on unique violation
 * (max 3), so both saves land with consecutive numbers on either dialect.
 * Also repoints specs.current_version_id at the new version.
 */
export async function insertSpecVersion(
  db: Db,
  schema: Schema,
  input: NewSpecVersionInput,
  hooks?: InsertHooks,
): Promise<{ id: string; number: number }> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const latest = await readLatest(db, schema, input.specId);
    await hooks?.beforeInsert?.(attempt);
    const row = versionRow(input, latest, Date.now());
    try {
      await db.insert(schema.spec_versions).values(row);
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isUniqueViolation(error)) continue;
      throw error;
    }
    await db
      .update(schema.specs)
      .set({ current_version_id: row.id, updated_at: row.created_at })
      .where(eq(schema.specs.id, input.specId));
    return { id: row.id, number: row.number };
  }
}

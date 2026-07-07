import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as sqliteSchema from "./schema.js";
import * as pgSchema from "./schema.pg.js";

export * as schema from "./schema.js";
export * as pgSchema from "./schema.pg.js";

/**
 * The app's single compile-time surface: queries are typed against the
 * SQLite schema. The Postgres schema mirrors it column-for-column (enforced
 * by test/parity.test.ts), and every column's TS value type is identical
 * (string/number/boolean/JSON object), so the same query code is valid for
 * both dialects. At runtime, connect() hands back the dialect-matched table
 * objects — never mix a client with the other dialect's tables.
 */
export type Schema = typeof sqliteSchema;
export type Db = LibSQLDatabase<Schema>;

export interface Connection {
  db: Db;
  schema: Schema;
  dialect: "sqlite" | "postgres";
}

export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Dial the right driver from the URL: libsql for file:/libsql:, postgres-js
 * for postgres:// (ADR-3). SQLite remains the zero-setup default.
 *
 * Workers-safe boundary (ADR-2): the Node-only `postgres` driver is loaded
 * via dynamic import inside the postgres branch, so a bundle that never
 * passes a postgres:// URL never pulls it into the entry graph — it stays
 * a lazy chunk that only loads when a postgres URL is actually used.
 */
export async function connect(url: string): Promise<Connection> {
  if (isPostgresUrl(url)) {
    const [{ drizzle: drizzlePg }, { default: postgres }] = await Promise.all([
      import("drizzle-orm/postgres-js"),
      import("postgres"),
    ]);
    const client = postgres(url, { onnotice: () => {} });
    const db = drizzlePg(client, { schema: pgSchema });
    // Deliberate type mask (see Schema docs above): runtime objects are pg,
    // compile-time surface stays the SQLite schema for a single app codebase.
    return {
      db: db as unknown as Db,
      schema: pgSchema as unknown as Schema,
      dialect: "postgres",
    };
  }
  const db = drizzleLibsql(createClient({ url }), { schema: sqliteSchema });
  return { db, schema: sqliteSchema, dialect: "sqlite" };
}

/** @deprecated SQLite-only sync factory kept for scripts; use connect(url). */
export function createDb(url = process.env.DATABASE_URL ?? "file:./data/specpasa.db"): Db {
  if (isPostgresUrl(url)) {
    throw new Error("createDb is SQLite-only — use `await connect(url)` for Postgres");
  }
  return drizzleLibsql(createClient({ url }), { schema: sqliteSchema });
}

// Query operators re-exported so the app consumes exactly one drizzle-orm
// instance (pnpm peers split instances per consumer; two instances make
// nominally-typed columns incompatible). App code must not import from
// "drizzle-orm" directly.
export { and, asc, count, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";

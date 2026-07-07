import { DATABASE_URL } from "astro:env/server";
import { connect, type Db } from "@specpasa/db";

/** One connection per process. DATABASE_URL is validated by astro:env at
 * boot; the file: default resolves relative to apps/web (the dev cwd). */
const connection = await connect(DATABASE_URL);

/**
 * Runtime-selected schema: SQLite table objects on the default file db,
 * Postgres table objects on postgres:// URLs — always matching getDb()'s
 * dialect. Import schema from THIS module inside the app, never from
 * @specpasa/db directly (that export is the SQLite variant only).
 */
export const schema = connection.schema;

export function getDb(): Db {
  return connection.db;
}

export const dbDialect = connection.dialect;

// Single-instance drizzle operators (see @specpasa/db) — import from here,
// never from "drizzle-orm" directly.
export { and, asc, count, desc, eq, gt, isNull, ne, or, sql } from "@specpasa/db";
export { insertSpecVersion, isUniqueViolation } from "@specpasa/db";

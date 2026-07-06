import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

/** SQLite/libsql client — the default self-host database (ADR-3). */
export function createDb(url = process.env.DATABASE_URL ?? "file:./data/specpasa.db") {
  return drizzle(createClient({ url }), { schema });
}

import { DATABASE_URL } from "astro:env/server";
import { createDb, type Db } from "@specpasa/db";

let db: Db | undefined;

/** Singleton db client. DATABASE_URL is validated by astro:env at boot;
 * its default resolves relative to apps/web (the dev cwd). */
export function getDb(): Db {
  db ??= createDb(DATABASE_URL);
  return db;
}

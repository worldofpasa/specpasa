import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// cwd is packages/db when run via `pnpm db:migrate`. Dialect follows the URL:
// postgres:// runs the drizzle-pg/ set, anything else the sqlite drizzle/ set.
const url = process.env.DATABASE_URL ?? "file:../../data/specpasa.db";

if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migratePg(drizzlePg(client), { migrationsFolder: "./drizzle-pg" });
  await client.end();
} else {
  await migrateLibsql(drizzleLibsql(createClient({ url })), { migrationsFolder: "./drizzle" });
}
console.error(`Migrations applied to ${url.replace(/\/\/[^@]*@/, "//<credentials>@")}`);

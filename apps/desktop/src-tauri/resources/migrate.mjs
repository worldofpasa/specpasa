// Desktop-shell migration runner: mirrors packages/db/src/migrate.ts
// (sqlite-only) with the migrations folder passed as an absolute path — the
// package's own runner resolves it against cwd. Staged next to dist/ inside
// resources/server so its imports resolve from the staged node_modules.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL;
const folder = process.argv[2];
if (!url || !folder) {
  console.error("usage: DATABASE_URL=file:… node migrate.mjs <abs-path-to-drizzle-folder>");
  process.exit(2);
}
await migrate(drizzle(createClient({ url })), { migrationsFolder: folder });
console.error(`migrations applied to ${url}`);

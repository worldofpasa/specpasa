import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// cwd is packages/db when run via `pnpm db:migrate`.
const url = process.env.DATABASE_URL ?? "file:../../data/specpasa.db";

const db = drizzle(createClient({ url }));
await migrate(db, { migrationsFolder: "./drizzle" });
console.error(`Migrations applied to ${url}`);

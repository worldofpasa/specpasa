import { defineConfig } from "drizzle-kit";

// SQLite (libsql) is the default self-host database; Postgres is the optional
// team profile — see docs/architecture.md ADR-3. The schema sticks to
// dialect-portable column types (text, integer, JSON-as-text, app-generated
// ULIDs) so a pg variant can be generated from the same source later.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // cwd is packages/db when run via `pnpm db:*` filters.
    url: process.env.DATABASE_URL ?? "file:../../data/specpasa.db",
  },
});

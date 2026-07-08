import { defineConfig } from "drizzle-kit";

// Postgres variant of ./drizzle.config.ts — same schema shape (parity-tested),
// separate migration set per dialect (ADR-3).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.pg.ts",
  out: "./drizzle-pg",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://specpasa:specpasa@localhost:5432/specpasa",
  },
});

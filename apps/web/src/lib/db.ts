import { createDb, type Db } from "@specpasa/db";

let db: Db | undefined;

/** Singleton db client. cwd is apps/web under `pnpm dev`; Docker sets DATABASE_URL. */
export function getDb(): Db {
  db ??= createDb(process.env.DATABASE_URL ?? "file:../../data/specpasa.db");
  return db;
}

export function getSecret(): string {
  const secret = process.env.SPECPASA_SECRET;
  if (!secret) {
    console.warn("SPECPASA_SECRET is not set — using an insecure dev fallback.");
    return "dev-only-insecure-secret";
  }
  return secret;
}

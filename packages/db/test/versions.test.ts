import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { newId } from "@specpasa/core";
import * as schema from "../src/schema.js";
import { insertSpecVersion, isUniqueViolation } from "../src/versions.js";
import type { Db, Schema } from "../src/index.js";

async function freshDb(): Promise<Db> {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, { migrationsFolder: "packages/db/drizzle" });
  return db;
}

const ts = 1_720_000_000_000;
let db: Db;
let specId: string;
let userId: string;

beforeEach(async () => {
  db = await freshDb();
  userId = newId();
  specId = newId();
  const workspaceId = newId();
  const projectId = newId();
  const intentId = newId();
  await db.insert(schema.users).values({
    id: userId,
    email: "james@bond.com",
    name: "James Bond",
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: "w",
    slug: "w",
    created_by: userId,
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.projects).values({
    id: projectId,
    workspace_id: workspaceId,
    name: "p",
    slug: "p",
    created_by: userId,
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.intents).values({
    id: intentId,
    project_id: projectId,
    title: "i",
    created_by: userId,
    created_at: ts,
    updated_at: ts,
  });
  await db.insert(schema.specs).values({
    id: specId,
    intent_id: intentId,
    title: "s",
    phase: "prd",
    status: "draft",
    created_by: userId,
    created_at: ts,
    updated_at: ts,
  });
});

const block = (text: string) => [{ block_id: newId(), type: "markdown" as const, markdown: text }];

describe("insertSpecVersion", () => {
  it("appends v1 on a blank spec and repoints current_version_id", async () => {
    const result = await insertSpecVersion(db, schema as unknown as Schema, {
      specId,
      blocks: block("hello"),
      createdBy: userId,
    });
    expect(result.number).toBe(1);
    const [spec] = await db.select().from(schema.specs);
    expect(spec!.current_version_id).toBe(result.id);
  });

  it("retries past a concurrent writer stealing the number", async () => {
    await insertSpecVersion(db, schema as unknown as Schema, {
      specId,
      blocks: block("v1"),
      createdBy: userId,
    });
    let raced = false;
    const result = await insertSpecVersion(
      db,
      schema as unknown as Schema,
      { specId, blocks: block("mine"), createdBy: userId },
      {
        // Simulate the race: another writer inserts v2 between our read and insert.
        beforeInsert: async () => {
          if (raced) return;
          raced = true;
          await db.insert(schema.spec_versions).values({
            id: newId(),
            spec_id: specId,
            number: 2,
            blocks: block("theirs"),
            created_by: userId,
            ai_generated: false,
            created_at: ts,
          });
        },
      },
    );
    expect(result.number).toBe(3); // lost the race for 2, landed on 3
    const rows = await db.select().from(schema.spec_versions);
    expect(rows.map((r) => r.number).sort()).toEqual([1, 2, 3]);
  });

  it("gives up after exhausting retries against a persistent collider", async () => {
    await insertSpecVersion(db, schema as unknown as Schema, {
      specId,
      blocks: block("v1"),
      createdBy: userId,
    });
    let next = 2;
    await expect(
      insertSpecVersion(
        db,
        schema as unknown as Schema,
        { specId, blocks: block("mine"), createdBy: userId },
        {
          beforeInsert: async () => {
            await db.insert(schema.spec_versions).values({
              id: newId(),
              spec_id: specId,
              number: next++,
              blocks: block("theirs"),
              created_by: userId,
              ai_generated: false,
              created_at: ts,
            });
          },
        },
      ),
    ).rejects.toThrow();
  });
});

describe("isUniqueViolation", () => {
  it("matches postgres-js SQLSTATE 23505", () => {
    expect(isUniqueViolation({ code: "23505", message: "duplicate key value" })).toBe(true);
  });
  it("matches libsql unique constraint errors", () => {
    expect(
      isUniqueViolation({
        code: "SQLITE_CONSTRAINT_UNIQUE",
        message: "UNIQUE constraint failed: spec_versions.spec_id, spec_versions.number",
      }),
    ).toBe(true);
    expect(isUniqueViolation(new Error("UNIQUE constraint failed: x"))).toBe(true);
  });
  it("ignores unrelated errors", () => {
    expect(isUniqueViolation(new Error("connection refused"))).toBe(false);
    expect(isUniqueViolation({ code: "23503", message: "fk violation" })).toBe(false);
  });
});

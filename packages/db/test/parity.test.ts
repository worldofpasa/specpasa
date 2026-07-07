import { describe, expect, it } from "vitest";
import { getTableConfig as sqliteConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { getTableConfig as pgConfig, PgTable } from "drizzle-orm/pg-core";
import * as sqliteSchema from "../src/schema.js";
import * as pgSchema from "../src/schema.pg.js";

interface ColumnShape {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  primary: boolean;
  enumValues: readonly string[] | undefined;
}

interface TableShape {
  name: string;
  columns: ColumnShape[];
  indexNames: string[];
}

function shapeOf(config: {
  name: string;
  columns: readonly {
    name: string;
    notNull: boolean;
    hasDefault: boolean;
    primary: boolean;
    enumValues?: string[] | undefined;
  }[];
  indexes: readonly { config: { name?: string | undefined } }[];
}): TableShape {
  return {
    name: config.name,
    columns: config.columns
      .map((c) => ({
        name: c.name,
        notNull: c.notNull,
        hasDefault: c.hasDefault,
        primary: c.primary,
        enumValues: c.enumValues,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    indexNames: config.indexes
      .map((i) => i.config.name ?? "")
      .filter(Boolean)
      .sort(),
  };
}

const sqliteTables = Object.entries(sqliteSchema).filter(
  (entry): entry is [string, InstanceType<typeof SQLiteTable>] => entry[1] instanceof SQLiteTable,
);
const pgTables = Object.entries(pgSchema).filter(
  (entry): entry is [string, InstanceType<typeof PgTable>] => entry[1] instanceof PgTable,
);

describe("sqlite/pg schema parity (ADR-3)", () => {
  it("exports the same table set", () => {
    expect(pgTables.map(([k]) => k).sort()).toEqual(sqliteTables.map(([k]) => k).sort());
  });

  for (const [exportName, table] of sqliteTables) {
    it(`table "${exportName}" matches column-for-column`, () => {
      const pgEntry = pgTables.find(([k]) => k === exportName);
      expect(pgEntry, `pg schema is missing export "${exportName}"`).toBeDefined();
      const sqliteShape = shapeOf(sqliteConfig(table));
      const pgShape = shapeOf(pgConfig(pgEntry![1]));
      expect(pgShape).toEqual(sqliteShape);
    });
  }
});

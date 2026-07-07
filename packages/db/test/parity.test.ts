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

/** ADR-3: the portable contract is the ORM-layer value shape. Each SQLite
 * column type may map only to these pg column types. Runtime round-trips are
 * covered by the browser E2Es run against both dialects. */
const COLUMN_TYPE_MAP: Record<string, string[]> = {
  SQLiteText: ["PgText"],
  SQLiteTextJson: ["PgJson"],
  SQLiteBoolean: ["PgBoolean"],
  // unix-ms timestamps go to bigint; small counts/positions stay integer
  SQLiteInteger: ["PgBigInt53", "PgInteger"],
};

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

const sqliteTables = Object.entries(sqliteSchema).filter(([, v]) => v instanceof SQLiteTable) as [
  string,
  SQLiteTable,
][];
const pgTables = Object.entries(pgSchema).filter(([, v]) => v instanceof PgTable) as [
  string,
  PgTable,
][];

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

    it(`table "${exportName}" column types stay within the ADR-3 mapping`, () => {
      const pgEntry = pgTables.find(([k]) => k === exportName)!;
      const pgByName = new Map(pgConfig(pgEntry[1]).columns.map((c) => [c.name, c]));
      for (const column of sqliteConfig(table).columns) {
        const allowed = COLUMN_TYPE_MAP[column.columnType];
        expect(allowed, `unmapped sqlite column type ${column.columnType}`).toBeDefined();
        const pgColumn = pgByName.get(column.name)!;
        expect(
          allowed,
          `${exportName}.${column.name}: ${column.columnType} -> ${pgColumn.columnType}`,
        ).toContain(pgColumn.columnType);
      }
    });

    it(`table "${exportName}" foreign keys reference the same targets`, () => {
      const pgEntry = pgTables.find(([k]) => k === exportName)!;
      const fkShape = (
        fks: readonly {
          reference: () => {
            columns: readonly { name: string }[];
            foreignColumns: readonly { name: string }[];
          };
        }[],
      ) =>
        fks
          .map((fk) => {
            const ref = fk.reference();
            return {
              from: ref.columns.map((c) => c.name),
              to: ref.foreignColumns.map((c) => c.name),
            };
          })
          .sort((a, b) => a.from.join().localeCompare(b.from.join()));
      expect(fkShape(pgConfig(pgEntry[1]).foreignKeys)).toEqual(
        fkShape(sqliteConfig(table).foreignKeys),
      );
    });
  }
});

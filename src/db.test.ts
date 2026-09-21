import assert from "node:assert/strict";
import { test } from "node:test";
import { createPgStore, isUndefinedColumnError } from "./db";

function undefinedColumn(column: string): Error & { code: string } {
  const err = new Error(`column "${column}" does not exist`) as Error & {
    code: string;
  };
  err.code = "42703";
  return err;
}

test("isUndefinedColumnError detects Postgres 42703", () => {
  assert.equal(isUndefinedColumnError(undefinedColumn("source_url")), true);
  assert.equal(isUndefinedColumnError(new Error("nope")), false);
  assert.equal(isUndefinedColumnError({ code: "42P01" }), false);
});

test("listInsights falls back when source_url/fetched_at are missing", async () => {
  const sqls: string[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      sqls.push(String(sql));
      if (String(sql).includes("source_url")) {
        throw undefinedColumn("source_url");
      }
      assert.equal(params[0], false);
      return {
        rows: [
          {
            id: "660e8400-e29b-41d4-a716-446655440000",
            title: "Manual note",
            value: "1",
            detail: "body",
            source: "manual",
            created_at: "2026-09-21T00:00:00.000Z",
            updated_at: "2026-09-21T00:15:00.000Z",
          },
        ],
      };
    },
  };
  const store = createPgStore(pool as never);
  const rows = await store.listInsights({ includeDemo: false });
  assert.equal(sqls.length, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "Manual note");
  assert.equal(rows[0]?.source, "manual");
  assert.equal(rows[0]?.source_url, null);
  assert.equal(rows[0]?.fetched_at, null);
  assert.equal(rows[0]?.detail, "body");
});

test("listInsights does not invent rows when the table is empty", async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const store = createPgStore(pool as never);
  const rows = await store.listInsights({ includeDemo: false });
  assert.deepEqual(rows, []);
});

test("upsertInsight falls back when provenance columns are missing", async () => {
  const pool = {
    async query(sql: string) {
      if (String(sql).includes("source_url")) {
        throw undefinedColumn("source_url");
      }
      return {
        rows: [
          {
            id: "660e8400-e29b-41d4-a716-446655440000",
            title: "Manual note",
            value: "1",
            detail: "",
            source: "manual",
            created_at: "2026-09-21T00:00:00.000Z",
            updated_at: "2026-09-21T00:00:00.000Z",
            inserted: true,
          },
        ],
      };
    },
  };
  const store = createPgStore(pool as never);
  const { row, created } = await store.upsertInsight({
    title: "Manual note",
    value: "1",
    source: "manual",
  });
  assert.equal(created, true);
  assert.equal(row.source_url, null);
  assert.equal(row.fetched_at, null);
});

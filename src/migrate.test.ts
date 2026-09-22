import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  defaultMigrationsDir,
  listMigrationFiles,
  splitSqlStatements,
} from "./migrate";

test("splitSqlStatements ignores comments and keeps quoted regex intact", () => {
  const sql = `
-- comment with a semicolon;
ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE insights
  ADD CONSTRAINT insights_source_url_http CHECK (
    source_url IS NULL OR source_url ~* '^https?://'
  );
`;
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? "", /ADD COLUMN IF NOT EXISTS source_url/);
  assert.ok((statements[1] ?? "").includes("~* '^https?://'"));
});

test("006 and 007 split into executable statements", () => {
  const dir = defaultMigrationsDir();
  const files = listMigrationFiles(dir);
  const ids = files.map((file) => file.id);
  assert.ok(ids.includes("006_domain_warehouse"));
  assert.ok(ids.includes("007_reserved_live_sources"));

  const sql006 = fs.readFileSync(
    path.join(dir, "006_domain_warehouse.sql"),
    "utf8"
  );
  const statements006 = splitSqlStatements(sql006);
  assert.ok(statements006.length > 10);
  assert.ok(
    statements006.some((stmt) =>
      /ADD COLUMN IF NOT EXISTS source_url text/i.test(stmt)
    )
  );
  assert.ok(
    statements006.some((stmt) =>
      /ADD COLUMN IF NOT EXISTS fetched_at timestamptz/i.test(stmt)
    )
  );
  assert.ok(
    statements006.some((stmt) => /CREATE TABLE IF NOT EXISTS institutions/i.test(stmt))
  );
  assert.ok(statements006.every((stmt) => !stmt.startsWith("--")));

  const sql007 = fs.readFileSync(
    path.join(dir, "007_reserved_live_sources.sql"),
    "utf8"
  );
  const statements007 = splitSqlStatements(sql007);
  assert.ok(statements007.some((stmt) => stmt.includes("'ipeds'")));
  assert.ok(statements007.some((stmt) => stmt.includes("'fred'")));

  const sql008 = fs.readFileSync(path.join(dir, "008_credentials.sql"), "utf8");
  const statements008 = splitSqlStatements(sql008);
  assert.ok(
    statements008.some((stmt) => /CREATE TABLE IF NOT EXISTS credentials/i.test(stmt))
  );
  assert.ok(statements008.every((stmt) => !/DROP TABLE/i.test(stmt)));

  const sql009 = fs.readFileSync(path.join(dir, "009_licenses_certs_econ.sql"), "utf8");
  const statements009 = splitSqlStatements(sql009);
  assert.ok(statements009.some((stmt) => /CREATE TABLE IF NOT EXISTS licenses/i.test(stmt)));
  assert.ok(
    statements009.some((stmt) => /CREATE TABLE IF NOT EXISTS certifications/i.test(stmt))
  );
  assert.ok(
    statements009.some((stmt) => /CREATE TABLE IF NOT EXISTS econ_indicators/i.test(stmt))
  );
  assert.ok(statements009.every((stmt) => !/DROP TABLE/i.test(stmt)));
});

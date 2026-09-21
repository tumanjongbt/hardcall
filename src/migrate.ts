import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { createPool } from "./db";

export const MIGRATION_ADVISORY_LOCK = 806006007;

type MigrationFile = {
  id: string;
  file: string;
};

export function listMigrationFiles(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/, ""),
      file: path.join(dir, name),
    }));
}

export function defaultMigrationsDir(): string {
  return path.resolve(__dirname, "../migrations");
}

/** Split DDL so each statement can run on a PgBouncer transaction-pooler client. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (!inSingle && ch === "-" && next === "-") {
      i += 1;
      while (i + 1 < sql.length && sql[i + 1] !== "\n") i++;
      continue;
    }
    if (ch === "'") {
      if (inSingle && next === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === ";" && !inSingle) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

export type MigrationReport = {
  applied: string[];
  skipped: string[];
};

async function withAdvisoryLock<T>(
  client: PoolClient,
  fn: () => Promise<T>
): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [
      MIGRATION_ADVISORY_LOCK,
    ]);
  }
}

/**
 * Apply pending migrations/*.sql on a held client (pooler-safe).
 * One file = one transaction. Statements are executed one at a time so
 * node-pg / PgBouncer transaction mode does not reject multi-command queries.
 */
export async function applyPendingMigrations(
  pool: Pool,
  migrationsDir = defaultMigrationsDir()
): Promise<MigrationReport> {
  const migrations = listMigrationFiles(migrationsDir);
  if (migrations.length === 0) {
    throw new Error(`no migrations found in ${migrationsDir}`);
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      for (const migration of migrations) {
        const { rows } = await client.query(
          "SELECT 1 FROM schema_migrations WHERE id = $1",
          [migration.id]
        );
        if (rows.length > 0) {
          skipped.push(migration.id);
          continue;
        }

        const sql = fs.readFileSync(migration.file, "utf8");
        const statements = splitSqlStatements(sql);
        await client.query("BEGIN");
        try {
          for (const statement of statements) {
            await client.query(statement);
          }
          await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [
            migration.id,
          ]);
          await client.query("COMMIT");
          applied.push(migration.id);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    });
  } finally {
    client.release();
  }
  return { applied, skipped };
}

/**
 * Minimum insight provenance columns for GET/POST /api/insights.
 * Idempotent. Used when the full 006 file cannot run so list/upsert still work.
 * Does not invent KPI rows.
 */
export async function ensureInsightsProvenanceColumns(pool: Pool): Promise<void> {
  await pool.query(
    "ALTER TABLE insights ADD COLUMN IF NOT EXISTS source_url text"
  );
  await pool.query(
    "ALTER TABLE insights ADD COLUMN IF NOT EXISTS fetched_at timestamptz"
  );
}

function invokedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = path.basename(entry);
  return base === "migrate.js" || base === "migrate.ts";
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = createPool(databaseUrl);
  try {
    const report = await applyPendingMigrations(pool);
    for (const id of report.skipped) {
      console.log(`${id} already applied`);
    }
    for (const id of report.applied) {
      console.log(`${id} applied`);
    }
  } finally {
    await pool.end();
  }
}

if (invokedAsCli()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createPool } from "./db";

type MigrationFile = {
  id: string;
  file: string;
};

function listMigrationFiles(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/, ""),
      file: path.join(dir, name),
    }));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, "../migrations");
  const migrations = listMigrationFiles(migrationsDir);
  if (migrations.length === 0) {
    console.error(`no migrations found in ${migrationsDir}`);
    process.exit(1);
  }

  const pool = createPool(databaseUrl);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of migrations) {
      const { rows } = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE id = $1",
        [migration.id]
      );
      if (rows.length > 0) {
        console.log(`${migration.id} already applied`);
        continue;
      }

      const sql = fs.readFileSync(migration.file, "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [
          migration.id,
        ]);
        await pool.query("COMMIT");
        console.log(`${migration.id} applied`);
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

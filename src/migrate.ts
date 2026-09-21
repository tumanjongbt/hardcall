import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const MIGRATION_ID = "001_events";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sqlPath = path.resolve(__dirname, "../migrations/001_events.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE id = $1",
      [MIGRATION_ID]
    );
    if (rows.length > 0) {
      console.log(`${MIGRATION_ID} already applied`);
      return;
    }

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [
        MIGRATION_ID,
      ]);
      await pool.query("COMMIT");
      console.log(`${MIGRATION_ID} applied`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "dotenv/config";
import { createApp } from "./app";
import { createPgStore, createPool } from "./db";
import { allowDemoFromEnv } from "./demo_gate";
import { runIngest } from "./ingest/run";
import { createPgWarehouse } from "./ingest/warehouse";
import { ingestTokenFromEnv } from "./ingest_auth";
import {
  applyPendingMigrations,
  ensureInsightsProvenanceColumns,
} from "./migrate";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const allowDemo = allowDemoFromEnv();

const pool = createPool(databaseUrl);
const warehouse = createPgWarehouse(pool);
const app = createApp(createPgStore(pool), {
  logger: true,
  allowDemo,
  warehouse,
  ingestToken: ingestTokenFromEnv(),
  runIngest: (source) => runIngest({ source, warehouse }),
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function start() {
  try {
    const report = await applyPendingMigrations(pool);
    app.log.info(
      { applied: report.applied, skipped: report.skipped },
      "schema migrations"
    );
  } catch (err) {
    app.log.error(
      err,
      "full migrate failed (Render pooler or unapplied 006/007). Trying insight columns only; paste remaining SQL in Supabase if warehouse tables are still missing"
    );
  }
  try {
    await ensureInsightsProvenanceColumns(pool);
  } catch (err) {
    app.log.error(
      err,
      "could not ADD insights.source_url/fetched_at; GET /api/insights will use the pre-006 column fallback"
    );
  }
  await app.listen({ port, host });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

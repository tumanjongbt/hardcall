import "dotenv/config";
import { createApp } from "./app";
import { createPgStore, createPool } from "./db";
import { allowDemoFromEnv } from "./demo_gate";
import { createPgWarehouse } from "./ingest/warehouse";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const allowDemo = allowDemoFromEnv();

const pool = createPool(databaseUrl);
const app = createApp(createPgStore(pool), {
  logger: true,
  allowDemo,
  warehouse: createPgWarehouse(pool),
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

app.listen({ port, host }).catch((err) => {
  console.error(err);
  process.exit(1);
});

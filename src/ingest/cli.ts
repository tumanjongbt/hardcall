import "dotenv/config";
import { parseArgs } from "node:util";
import { createPool } from "../db";
import { allowDemoFromEnv } from "../demo_gate";
import {
  applyPendingMigrations,
  ensureInsightsProvenanceColumns,
} from "../migrate";
import { INGEST_SOURCES, runIngest, type IngestSource } from "./run";
import { createPgWarehouse } from "./warehouse";

const SOURCES = new Set<IngestSource>(INGEST_SOURCES);

function usage(): string {
  return `Usage: ingest --source <all|apprenticeship_gov|scorecard|bls|onet|bls_ep|careeronestop|census|bea|fred> [options]

Fetch official feeds, upsert warehouse tables, and emit Events/Insights
derived only from those rows (never invented). Reserved live sources are
written here — public POST /api/events cannot mint them.

Options:
  --source <NAME>     adapter to run (default all)
  --file <PATH>       local file instead of HTTP (single-source only)
  --limit <N>         max parsed rows per feed
  --dry-run           parse and print counts; no database writes
  --skip-derive       warehouse only; do not upsert events/insights
  -h, --help

Env:
  DATABASE_URL              required unless --dry-run
  HARDCALL_ALLOW_DEMO       production must be false
  APPRENTICESHIP_CSV_URL    override DOL CSV
  SCORECARD_INSTITUTION_URL override Scorecard institution zip
  SCORECARD_FIELD_OF_STUDY_URL
  ONET_OCCUPATION_URL       override O*NET Occupation Data CSV
  BLS_OEWS_URL              override OEWS Table 1 / file URL
  BLS_EP_URL                override Employment Projections Table 1.2 URL
  CAREERONESTOP_USER_ID     CareerOneStop user id (with API token)
  CAREERONESTOP_API_TOKEN   CareerOneStop bearer token
  CAREERONESTOP_MAX_RECORDS page cap (default 200); never stores Bing geocodes
  CAREERONESTOP_WAGE_KEYWORD  optional SOC/title for wage compare
  CAREERONESTOP_WAGE_LOCATION optional state or ZIP for wage compare
  CENSUS_API_KEY            Census Data API key (ACS 5-year)
  CENSUS_ACS_YEAR           optional ACS year (default try 2024 then 2023)
  BEA_API_KEY               BEA UserID
  FRED_API_KEY              optional FRED key (UNRATE, CPIAUCSL)

--source all runs keyless feeds plus any Phase B/C adapter whose key is set.
bls.gov often returns 403; use --source bls_ep --file PATH (.xlsx, .csv, or .htm).
`;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: "string", default: "all" },
      file: { type: "string" },
      limit: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "skip-derive": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(usage());
    return 0;
  }

  const source = (values.source || "all") as IngestSource;
  if (!SOURCES.has(source)) {
    process.stderr.write(`error: unknown --source ${source}\n`);
    return 1;
  }
  if (values.file && source === "all") {
    process.stderr.write("error: --file requires a single --source\n");
    return 1;
  }

  const dryRun = Boolean(values["dry-run"]);
  const limit = values.limit ? Number(values.limit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    process.stderr.write("error: --limit must be a positive integer\n");
    return 1;
  }

  if (!dryRun && !process.env.DATABASE_URL) {
    process.stderr.write("error: DATABASE_URL is required unless --dry-run\n");
    return 1;
  }

  if (!allowDemoFromEnv() && process.env.NODE_ENV === "production") {
    process.stdout.write("HARDCALL_ALLOW_DEMO=false (production ingest of live feeds only)\n");
  }

  const pool = process.env.DATABASE_URL ? createPool(process.env.DATABASE_URL) : null;
  try {
    if (pool && !dryRun) {
      try {
        const migrations = await applyPendingMigrations(pool);
        process.stdout.write(
          `migrate applied=${migrations.applied.join(",") || "none"} skipped=${migrations.skipped.length}\n`
        );
      } catch (err) {
        process.stderr.write(
          `warning: full migrate failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        try {
          await ensureInsightsProvenanceColumns(pool);
        } catch (ensureErr) {
          process.stderr.write(
            `warning: insight provenance columns: ${ensureErr instanceof Error ? ensureErr.message : String(ensureErr)}\n`
          );
        }
      }
    }
    const report = await runIngest({
      source,
      file: values.file,
      limit,
      dryRun,
      skipDerive: Boolean(values["skip-derive"]),
      warehouse: pool ? createPgWarehouse(pool) : undefined,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } finally {
    if (pool) await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

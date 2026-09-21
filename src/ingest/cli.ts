import "dotenv/config";
import { parseArgs } from "node:util";
import { createPool } from "../db";
import { allowDemoFromEnv } from "../demo_gate";
import { runIngest, type IngestSource } from "./run";
import { createPgWarehouse } from "./warehouse";

const SOURCES = new Set<IngestSource>([
  "all",
  "apprenticeship_gov",
  "scorecard",
  "bls",
  "onet",
]);

function usage(): string {
  return `Usage: ingest --source <all|apprenticeship_gov|scorecard|bls|onet> [options]

Fetch official bulk feeds, upsert warehouse tables, and emit Events/Insights
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

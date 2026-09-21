# Render + Supabase deploy checklist (8pm flip)

Production must not serve synthetic / playground / CLI / seed rows as if they were real.

## Supabase (SQL editor)

1. Paste `migrations/006_domain_warehouse.sql` in full, then `007_reserved_live_sources.sql`.
2. Record the stems:

```sql
INSERT INTO schema_migrations (id) VALUES ('006_domain_warehouse')
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id) VALUES ('007_reserved_live_sources')
ON CONFLICT (id) DO NOTHING;
```

3. Confirm zero public demo rows (or they will be hidden by the API when demo is off):

```sql
SELECT source, count(*) FROM events GROUP BY source ORDER BY 2 DESC;
SELECT source, count(*) FROM insights GROUP BY source ORDER BY 2 DESC;
```

Optional archive:

```sql
DELETE FROM events WHERE source IN ('synthetic', 'playground', 'cli');
DELETE FROM insights WHERE source = 'synthetic';
```

## Render web service

| Setting | Value |
| --- | --- |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health | `/health` |
| `DATABASE_URL` | Supabase **transaction pooler** (`*.pooler.supabase.com:6543`) |
| `HARDCALL_ALLOW_DEMO` | **`false`** |
| `NODE_ENV` | `production` (Render sets this) |

Do **not** put API keys or `DATABASE_URL` in the Vite dashboard build. Optional later keys (`SCORECARD_API_KEY`, `BLS_API_KEY`, `ONET_API_KEY`, `DOL_API_KEY`, `CAREERONESTOP_USER_ID`, `CAREERONESTOP_API_TOKEN`, `CENSUS_API_KEY`, `BEA_API_KEY`, `FRED_API_KEY`) stay on Render only. **Phase A is keyless bulk** (Scorecard zips, OEWS tables, O\*NET DB). CareerOneStop is Phase B and **must never persist Bing geocodes**.

Costs in the UI are **institution / program cost of attendance (College Scorecard)** — there is no national per-course price API.

## Render cron / worker

Same repo, same `DATABASE_URL`. Start command:

```bash
node dist/ingest/cli.js --source all
```

Suggested schedule: daily (OEWS/Scorecard are release-based, not tick streams).

First run after migrate (expect several minutes; Scorecard FoS unzip is ~150MB):

```bash
node dist/ingest/cli.js --source apprenticeship_gov
node dist/ingest/cli.js --source scorecard
node dist/ingest/cli.js --source onet
node dist/ingest/cli.js --source bls
```

If BLS returns HTTP 403 from the datacenter, download the national XLSX/TXT from https://www.bls.gov/oes/tables.htm (or Table 1 at https://www.bls.gov/news.release/ocwage.t01.htm) and rerun:

```bash
node dist/ingest/cli.js --source bls --file /path/to/oes-table1.txt
```

Dry-run without Postgres:

```bash
node dist/ingest/cli.js --source apprenticeship_gov --dry-run
```

## Prove live data

```bash
curl -sS https://hardcall-api.onrender.com/api/meta
curl -sS https://hardcall-api.onrender.com/api/events?limit=5
curl -sS https://hardcall-api.onrender.com/api/insights
```

Expect `allow_demo: false`, Live badges (`scorecard`, `apprenticeship_gov`, `bls`, `onet`), clickable `source_url`, and `fetched_at` on those rows.

Spoof check (must stay 400 `reserved`, not 201):

```bash
curl -sS -o /tmp/spoof.json -w '%{http_code}\n' -X POST https://hardcall-api.onrender.com/api/events \
  -H 'Content-Type: application/json' \
  -d '{"channel":"trade","title":"Spoof","source":"bls","source_url":"https://www.bls.gov/oes/tables.htm","fetched_at":"2026-09-21T12:00:00Z"}'
```

Playground/seed write check (must be 403 `demo_disabled`):

```bash
curl -sS -o /tmp/demo.json -w '%{http_code}\n' -X POST https://hardcall-api.onrender.com/api/events \
  -H 'Content-Type: application/json' \
  -d '{"channel":"trade","title":"Seed","source":"playground"}'
```

## Staging

Leave `HARDCALL_ALLOW_DEMO=true` on a staging API if Bernard still needs Playground / Admin seed. Never point the production dashboard at that API.

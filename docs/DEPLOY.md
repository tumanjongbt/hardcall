# Render + Supabase deploy checklist (8pm flip)

Production must not serve synthetic / playground / CLI / seed rows as if they were real.

## Supabase (SQL editor)

**Paste 006–009 only if boot migrate did not apply them.** After this API deploy, Render `npm start` runs pending migrations against `DATABASE_URL` (held client, one statement at a time — transaction pooler safe). Ingest CLI does the same before a live run.

Check Render logs for `schema migrations` with `006_domain_warehouse`, `007_reserved_live_sources`, `008_credentials`, and `009_licenses_certs_econ` in `applied` or `skipped`. If they are present, **do not paste**. If migrate failed, paste in order:

1. Paste in order: `migrations/006_domain_warehouse.sql`, `007_reserved_live_sources.sql`, `008_credentials.sql`, `009_licenses_certs_econ.sql`.
2. Record the stems:

```sql
INSERT INTO schema_migrations (id) VALUES ('006_domain_warehouse')
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id) VALUES ('007_reserved_live_sources')
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id) VALUES ('008_credentials')
ON CONFLICT (id) DO NOTHING;
INSERT INTO schema_migrations (id) VALUES ('009_licenses_certs_econ')
ON CONFLICT (id) DO NOTHING;
```

`008` / `009` use `CREATE TABLE IF NOT EXISTS`. They do not drop live credential, license, certification, or econ rows. If those tables already exist from an earlier paste, boot migrate records the stem and leaves the rows in place. The read API maps known column aliases (`id` / `title` / `ctid`, and the canonical names).

`GET /api/insights` must not 500 while that SQL is pending: the store retries without `source_url`/`fetched_at` (nulls, no invented rows). Warehouse ingest still needs the 006 tables.

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

Do **not** put API keys or `DATABASE_URL` in the Vite dashboard build. Keys below stay on the Render **ingest cron** (and the API service only if it runs ingest). Never `VITE_*`.

| Env var | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | all live runs | Supabase transaction pooler |
| `HARDCALL_ALLOW_DEMO` | production | `false` |
| `CAREERONESTOP_USER_ID` | `--source careeronestop` (and `all` when set) | With the API token. [Register](https://www.careeronestop.org/Developers/WebAPI/registration.aspx) |
| `CAREERONESTOP_API_TOKEN` | same | Bearer token. **Never persist Bing geocodes** |
| `CAREERONESTOP_MAX_RECORDS` | optional | Default 200 licenses and 200 certifications per run |
| `CAREERONESTOP_WAGE_KEYWORD` | optional | SOC or title. Also set `CAREERONESTOP_WAGE_LOCATION` (state or ZIP) |
| `CENSUS_API_KEY` | `--source census` | [Key signup](https://api.census.gov/data/key_signup.html). Optional `CENSUS_ACS_YEAR` (tries 2024, then 2023) |
| `BEA_API_KEY` | `--source bea` | BEA UserID from [signup](https://apps.bea.gov/API/signup/index.html). Optional `BEA_GDP_TABLE` (default `SAGDP2N` line 1) and `BEA_INCOME_TABLE` (default `SAINC1` line 3) |
| `FRED_API_KEY` | `--source fred` | Optional macro series `UNRATE`, `CPIAUCSL`. [API key](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `BLS_EP_URL` | optional | Override Employment Projections Table 1.2 URL |

Phase A (`scorecard`, `bls` OEWS, `onet`) and `apprenticeship_gov` stay keyless. `bls_ep` is keyless but bls.gov often returns HTTP 403 from Render; use `--file` (below). `all` runs keyed adapters only when the matching env vars are set and logs a skip line otherwise. Credential Engine / CTDL is not configured: that registry needs its own account, and CareerOneStop certifications cover the credential list.

Costs in the UI are **institution / program cost of attendance (College Scorecard)** — there is no national per-course price API.

## Render cron / worker

Same repo, same `DATABASE_URL`. Start command:

```bash
node dist/ingest/cli.js --source all
```

Suggested schedule: daily `0 6 * * *` (`render.yaml`). That pull is what keeps `fetched_at` current. It is not a tick stream.

| Dataset | Cadence label | Stale after |
| --- | --- | --- |
| FRED (`UNRATE`, `CPIAUCSL`) | Daily-ish latest observation | 72 hours |
| CareerOneStop licenses and certifications | Weekly | 10 days |
| Apprenticeship.gov sponsor CSV | Weekly | 10 days |
| College Scorecard, BLS OEWS, BLS EP, O*NET, Census ACS, BEA, Credential Engine | Release-driven, still pulled on this schedule | 14 days |

OEWS and Employment Projections are release-driven BLS products. This warehouse does not ingest a separate daily BLS time series; the daily-ish macro series are FRED. Credential Engine rows are read from the warehouse. There is no keyless Credential Engine pull in the cron.

There is **no** `POST /api/ingest/:source`. The cron command above is the worker. It talks to Postgres with `DATABASE_URL` and the provider keys. Those keys stay off the public web process. A token-protected HTTP trigger would run Scorecard unzip inside the request path; do not add one.

First run after migrate (expect several minutes; Scorecard FoS unzip is ~150MB):

```bash
node dist/ingest/cli.js --source apprenticeship_gov
node dist/ingest/cli.js --source scorecard
node dist/ingest/cli.js --source onet
node dist/ingest/cli.js --source bls
node dist/ingest/cli.js --source bls_ep
```

With the Phase B/C keys set on the cron service, the same `all` command also runs `careeronestop`, `census`, `bea`, and `fred`. Without a key, that source is skipped and the log names the missing variable.

If BLS returns HTTP 403 from the datacenter, download the national XLSX/TXT from https://www.bls.gov/oes/tables.htm (or Table 1 at https://www.bls.gov/news.release/ocwage.t01.htm) and rerun:

```bash
node dist/ingest/cli.js --source bls --file /path/to/oes-table1.txt
```

Employment Projections (growing and declining occupations) use the same bypass. Download Table 1.2 from https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm (XLSX link on that page, or the HTML table) and rerun:

```bash
node dist/ingest/cli.js --source bls_ep --file /path/to/occupational-projections.xlsx
```

`.csv` and `.htm` exports of that table also parse. Employment is published in thousands; the warehouse stores persons. Annual openings are kept on derived insights (the `projections` table has employment and percent change, not an openings column).

Dry-run without Postgres:

```bash
node dist/ingest/cli.js --source apprenticeship_gov --dry-run
```

## Prove live data

```bash
curl -sS https://hardcall-api.onrender.com/api/meta
curl -sS https://hardcall-api.onrender.com/api/feeds
curl -sS https://hardcall-api.onrender.com/api/warehouse
curl -sS 'https://hardcall-api.onrender.com/api/institutions?state=ID&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/programs?cip=11.07&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/sponsors?state=ID&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/occupations?q=nurse&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/wages?soc=29-1141&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/projections?outlook=grow&limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/credentials?limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/licenses?limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/certifications?limit=2'
curl -sS 'https://hardcall-api.onrender.com/api/econ?source=fred&limit=2'
curl -sS https://hardcall-api.onrender.com/api/events?limit=5
curl -sS https://hardcall-api.onrender.com/api/insights
```

Expect `allow_demo: false`. Warehouse rows include `source`, `source_url`, and `fetched_at`. `GET /api/feeds` `status` is `ok`, `stale`, or `error`. List responses are `{ "<resource>": [], "limit", "offset", "total" }` with default `limit` 50 and max 200. `outlook=grow` is `change_percent > 0`; `outlook=decline` is `change_percent < 0`.

New routes (all public GET, no auth):

| Path | Body |
| --- | --- |
| `GET /api/warehouse` | `{ ok, warehouse }` counts. Connection failure is **500** `persist_failed`. |
| `GET /api/feeds` | `{ feeds }` per-source freshness. Also embedded on `GET /api/meta`. |
| `GET /api/institutions` | Scorecard institutions. Filters: `q`, `state`, `type` (control), `channel` (`university` or `community_college`), `source`. |
| `GET /api/programs` | Scorecard programs, `state` via the institution join. Also `cip`. |
| `GET /api/sponsors` | Apprenticeship.gov sponsors. `channel=apprenticeship` only. |
| `GET /api/occupations` | O*NET. `soc` matches `11-1011` to `11-1011.00`. |
| `GET /api/wages` | OEWS (and CareerOneStop wage rows). `type` is `area_type`. |
| `GET /api/projections` | BLS EP. `outlook=grow\|decline`. |
| `GET /api/credentials` | Credential Engine snapshot. |
| `GET /api/licenses` | CareerOneStop licenses. |
| `GET /api/certifications` | CareerOneStop certifications. `type` is `cert_type`. |
| `GET /api/econ` | Census / BEA / FRED indicators. `source=census\|bea\|fred`. `state` matches `geo_id` or `geo_name`. |

`channel=trade` on institutions is an empty page (those rows are the college corpus, not a trade feed). Occupation, wage, projection, and econ routes ignore `channel` because the table has no channel column. Invalid `outlook` or `source` is **400** `validation_failed`. Anonymous `POST` still cannot mint reserved live sources. There is no ingest POST.

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

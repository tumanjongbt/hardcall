# Hardcall

Real-time career intelligence pipeline — education ROI and automation resilience.

Tagline: *the call that shapes your orbit.*

Phase 1 is the always-on ingest API and cloud Postgres store. Scrapers and data sources `POST /api/events`. Phase 1.5 adds a live SSE stream and a standalone `events` CLI. Phase 2 adds `GET /api/events` (history) and a local dashboard that filters, searches, paginates, and stays on the live stream. Market Insights adds `insights` KPI upserts (`POST /api/insight`) and a 15-second dashboard poll (`GET /api/insights`). Clicking a KPI card opens that topic’s analysis (`detail`).

## What ships

| Piece | Path |
| --- | --- |
| Protostar migration | `migrations/001_events.sql` |
| Insights migration | `migrations/002_insights.sql` |
| Insight detail migration | `migrations/003_insights_detail.sql` |
| Event/insight provenance | `migrations/004_event_provenance.sql` |
| Live-source integrity | `migrations/005_live_source_integrity.sql` |
| Domain warehouse + live enums | `migrations/006_domain_warehouse.sql` |
| Reserved live-source expansion | `migrations/007_reserved_live_sources.sql` |
| Keyless ingest worker | `src/ingest/` (`npm run ingest`) |
| Deploy checklist | `docs/DEPLOY.md` |
| Authoritative sources | `docs/AUTHORITATIVE_SOURCES.md` |
| Orion request validation | `src/events_validate.js`, `src/insights_validate.js` |
| HTTP contracts | `contracts/POST_api_events.md`, `contracts/GET_api_events.md`, `contracts/GET_api_events_stream.md`, `contracts/POST_api_insight.md`, `contracts/GET_api_insights.md` |
| TypeScript API | `src/app.ts`, `src/server.ts`, `src/sse_hub.ts` |
| `events` CLI | `cli/` (own package; see `cli/README.md`) |
| Dashboard | `dashboard/` (Vite; Events, Charts, Market Insights, Playground ingest; see `dashboard/README.md`) |

Table name is `events`. Schema identifiers stay product-neutral (no `hardcall` in DDL, routes, or error codes).

Ingest is **public** this phase (no API key). Treat that as a Phase 1b follow-up if you need a header later.

## Event shape

Required: `channel`, `title`. Optional: `description`, `emoji`, `tags`, `source`, `source_url`, `fetched_at`, `created_at`. Server sets `id`. Omitted `created_at` uses database `now()`; a valid ISO `created_at` is stored on insert only. Omitted `source` on an anonymous POST defaults to **`manual`**. Playground sends `playground`; CLI sends `cli`; seed/mock ingest should send `synthetic`.

**Channels:** `university` · `community_college` · `trade` · `apprenticeship` · `automation`

**Stakeholder tags:** `high_school_students` · `college_students` · `parents` · `career_counselors` · `workforce_training_managers`

**Event `source`:** `synthetic` · `manual` · `playground` · `cli` · `bls` · `onet` · `scorecard` · `apprenticeship_gov` · `bls_ep` · `ipeds` · `careeronestop` · `census` · `bea` · `fred` · `unknown`

Reserved live sources (`bls` / `onet` / `scorecard` / `apprenticeship_gov` / `bls_ep` / `ipeds` / `careeronestop` / `census` / `bea` / `fred`) stay in the stored enum for **server-side ingest only**. **Anonymous public POST cannot set them** (`400` `source` / `reserved`). Allowed on public POST: `synthetic` · `manual` · `playground` · `cli` · `unknown`. When `HARDCALL_ALLOW_DEMO=false` (production default), `synthetic` / `playground` / `cli` writes are **`403` `demo_disabled`**. `source_url` must be `http(s)` if present. `fetched_at` is an optional ISO timestamp. Live reserved event rows need both `source_url` and `fetched_at` (Protostar CHECK).

There is **no national per-course price API**. Scorecard ingest stores institution tuition/net price and CIP/program debt/earnings — label that as institution / program cost of attendance, never per-section sticker.

## Insight shape

Required: `title`, `value`. Optional: `detail` (analysis body, trim, max 8000), `source`, `source_url`, `fetched_at`. Anonymous public POST may send only `synthetic` · `manual` · `unknown`. Reserved live sources stay in the stored enum — **anonymous clients cannot set them** (`400` `source` / `reserved`). When demo is off, `source: synthetic` (including omitted source, which inserts as synthetic) is **`403` `demo_disabled`**. Exact `title` is the upsert key (unique). Server sets `id`, `created_at`, `updated_at`. Live reserved insight rows also need `source_url` and `fetched_at`.

## `DATABASE_URL` (Neon or Supabase)

Copy `.env.example` to `.env` locally. Only `.env.example` is committed. `createPool` enables TLS (`ssl.rejectUnauthorized = false`) so node-pg can talk to hosted poolers.

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
PORT=3000
HOST=0.0.0.0
```

**Neon**

1. Create a Neon project ([neon.tech](https://neon.tech)) — Postgres 16+ is fine.
2. Copy the connection string. Use `sslmode=require`.
3. For `npm run migrate`, prefer Neon’s **direct** host (not the `-pooler` host) so `CREATE INDEX` / `CREATE TYPE` are not sitting behind transaction-pooling limits.
4. For the running API, the pooled connection string is fine.

**Supabase**

Use the **transaction pooler** URI, not the direct host:

- Host: `*.pooler.supabase.com` on port **6543**
- User: `postgres.<project-ref>` (pooler user, not the bare `postgres` role)
- Example shape: `postgresql://postgres.<project-ref>:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`

Direct `db.<ref>.supabase.co` may not resolve from some environments (Cloud Agent / restricted DNS). The pooler host does. Session pooler (`:5432` on the same pooler hostname) is optional; transaction pooler (`:6543`) is the one that was live-proven for this API.

## Migrate (Protostar)

```bash
npm install
npm run build      # required before migrate (compiled runner)
npx tsc --noEmit   # optional extra typecheck
npm run migrate    # applies pending files in migrations/ (001_events, 002_insights, …)
```

`schema_migrations` records each file stem (`001_events` … `007_reserved_live_sources`) so the runner is idempotent. Re-running skips already-applied files. The API (`npm start`) and ingest CLI apply pending files on boot using a **held client** and **one statement at a time**, so the Supabase transaction pooler can run 006/007 without a Render release command.

**Do you still need to paste 006/007 in Supabase?**

- **No**, if Render logs show `006_domain_warehouse` / `007_reserved_live_sources` applied (or skipped as already applied) after deploy. Warehouse tables then exist; ingest can fill them. `GET /api/insights` should be 200 (empty list is OK until ingest writes live KPIs).
- **Yes**, if boot migrate errors (permissions, stem recorded without the SQL, or a CHECK that needs a manual remap). Paste `migrations/006_domain_warehouse.sql` then `007_reserved_live_sources.sql` in the SQL editor and record the stems. GET `/api/insights` still returns 200 without those columns: it retries the pre-006 SELECT (`source` only, `source_url`/`fetched_at` null). It does **not** invent KPI rows.

```sql
-- Only if boot migrate did not apply 006/007:
-- 1. Paste the full contents of migrations/006_domain_warehouse.sql
INSERT INTO schema_migrations (id) VALUES ('006_domain_warehouse')
ON CONFLICT (id) DO NOTHING;
-- 2. Paste migrations/007_reserved_live_sources.sql
INSERT INTO schema_migrations (id) VALUES ('007_reserved_live_sources')
ON CONFLICT (id) DO NOTHING;
```

See `docs/DEPLOY.md` for the production flip checklist (`HARDCALL_ALLOW_DEMO=false`, ingest cron, spoof/403 probes).

```sql
-- 1. Paste the full contents of migrations/005_live_source_integrity.sql
--    (UPDATE remaps spoofed bls/onet rows with NULL source_url or fetched_at
--    to unknown, then DROP/ADD events_live_source_integrity)
-- 2. Then:
INSERT INTO schema_migrations (id) VALUES ('005_live_source_integrity')
ON CONFLICT (id) DO NOTHING;
```

If `005_live_source_integrity` is already recorded in `schema_migrations` but the CHECK was never added (ERROR 23514 on the first paste, or the stem was inserted after a failed apply), the runner will skip the file. Run the remapping + constraint by hand, then leave the stem as-is:

```sql
UPDATE events
SET source = 'unknown'
WHERE source IN ('bls', 'onet')
  AND (source_url IS NULL OR fetched_at IS NULL);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_live_source_integrity;

ALTER TABLE events
  ADD CONSTRAINT events_live_source_integrity CHECK (
    source NOT IN ('bls', 'onet')
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );
```

After that, redeploy the Render web service so `source` / `source_url` / `fetched_at` are on events and `source` is on insights. Then (optional) re-seed analysis bodies with `source: "synthetic"`:

```bash
EVENTS_API_URL=https://hardcall-api.onrender.com node scripts/seed-insight-details.js
```

The migration creates `events` plus:

- `events_created_at_desc_idx` — `(created_at DESC, id DESC)`
- `events_channel_created_at_idx` — `(channel, created_at DESC)`
- `events_tags_gin_idx` — GIN on `tags`

Empty titles and empty-string optionals are illegal in the table. The API trims and turns blank `description` / `emoji` into `null` before insert.

## Live ingest

**Phase A** (`scorecard`, `bls` OEWS, `onet`) and the keyless `apprenticeship_gov` CSV need no API key. **Phase B/C** adapters run when their env vars are set. `bls_ep` is keyless (BLS Employment Projections Table 1.2) but bls.gov often returns HTTP 403, so pass `--file`. CareerOneStop never persists Bing geocodes. IPEDS stays reserved with no adapter yet.

Credential Engine / CTDL is not a second credential vendor here. Registry publishing needs a Credential Registry account and API keys ([apps.credentialengine.org/accounts](https://apps.credentialengine.org/accounts/)). There is no keyless bulk download comparable to the Scorecard zip. CareerOneStop certifications (DOLETA + Minnesota DEED) cover that gap.

```bash
npm run build
npm run ingest -- --source scorecard --dry-run
npm run ingest -- --source all
# or a local file:
npx tsx src/ingest/cli.ts --source scorecard --file fixtures/scorecard_institutions_sample.csv --dry-run
npx tsx src/ingest/cli.ts --source bls_ep --file fixtures/bls_ep_table_1_2_sample.csv --dry-run
```

| `--source` | Phase | Feed |
| --- | --- | --- |
| `scorecard` | A | College Scorecard most-recent institution + field-of-study zips (institution / program COA + CIP outcomes — **not** per-course prices) |
| `bls` | A | OEWS Table 1 / national tables |
| `onet` | A | O*NET Occupation Data CSV |
| `apprenticeship_gov` | B (keyless) | DOL OA Partner Sponsors CSV |
| `bls_ep` | A/B | BLS EP Table 1.2 (employment change and openings). `--file` accepts `.xlsx`, `.csv`, or `.htm` |
| `careeronestop` | B | Licenses + certifications; optional wage compare. Needs `CAREERONESTOP_USER_ID` and `CAREERONESTOP_API_TOKEN` |
| `census` | C | ACS 5-year income, population, labor force. Needs `CENSUS_API_KEY` |
| `bea` | C | Regional GDP (`SAGDP2N`) and per capita personal income (`SAINC1`). Needs `BEA_API_KEY` (UserID) |
| `fred` | C | Optional `UNRATE` and `CPIAUCSL`. Needs `FRED_API_KEY` |
| `all` | A–C | Keyless feeds, plus any keyed adapter whose env vars are set. Missing keys are skipped with an error line, not invented rows |

`--dry-run` parses and prints counts without `DATABASE_URL`. Production cron: `node dist/ingest/cli.js --source all` with `HARDCALL_ALLOW_DEMO=false`. See `docs/DEPLOY.md` for Render env vars.

## Run

```bash
npm run dev      # tsx watch, local
npm test         # Orion unit tests + HTTP contract tests
npm run build && npm start
```

- `GET /health` → `{ "ok": true }`
- `GET /api/meta` → `{ "ok", "allow_demo", "live_sources", "warehouse" }`
- `POST /api/events` → `201` + stored row, or `400` / `415` / `500` per the contract
- `GET /api/events` → `{ "events": [...] }` newest-first (`created_at DESC`, `id DESC`); optional `?channel=` and `?limit=` (default/max 1000)
- `GET /api/events/stream` → SSE (`text/event-stream`); each new insert is an SSE `message` whose JSON matches the stored row
- `POST /api/insight` → `201` insert or `200` exact-title upsert; body `{ "title", "value", "detail?" }`; omitted `detail` on update keeps the stored body; `400` / `415` / `500` same posture as events
- `GET /api/insights` → `{ "insights": [{ id, title, value, detail, source, created_at, updated_at }] }` ordered by `updated_at DESC`, then `title ASC`

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS "http://127.0.0.1:3000/api/events?channel=trade&limit=50"

curl -sS http://127.0.0.1:3000/api/insights

curl -sS -X POST http://127.0.0.1:3000/api/insight \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Top Trade Income Growth", "value": "+18%", "detail": "Electricians and HVAC still lead wage growth." }'

curl -sS -X POST http://127.0.0.1:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "university",
    "title": "CS starting salaries up in metro X",
    "description": "optional",
    "emoji": "📈",
    "tags": ["college_students", "parents"],
    "source": "manual"
  }'
```

### Live stream (SSE)

The stream stays open. After connect the server sends `retry: 5000` and a `: connected` comment, then comment heartbeats (`: keepalive`) so Render/proxies are less likely to idle-timeout the socket. There is no replay of past rows — only events created after you subscribe (in-memory hub; one Render instance).

```bash
# -N disables curl buffering so frames appear as they arrive
curl -N https://hardcall-api.onrender.com/api/events/stream
```

```js
const es = new EventSource("https://hardcall-api.onrender.com/api/events/stream");
es.onmessage = (e) => {
  const row = JSON.parse(e.data);
  console.log(row.id, row.channel, row.title, row.source);
};
es.onerror = (err) => console.error(err);
```

Local:

```bash
curl -N http://127.0.0.1:3000/api/events/stream
```

`GET /api/events` is public and CORS-open so the local dashboard can read history. Search, page size, and page number are client-side (see `dashboard/`). The list endpoint only filters by `channel` and caps `limit`.

### Dashboard (local)

Vite app in `dashboard/`. Logic and styles are separate files.

```bash
cd dashboard
npm install
npm run dev
```

Default API base is `https://hardcall-api.onrender.com` (`VITE_EVENTS_API_URL` — origin only, public, baked into the Vite bundle). The API is CORS-open (`Access-Control-Allow-Origin: *`) so the dashboard origin can read history and post events. If history 404s, Render has not redeployed this API yet — point the dashboard at a local API:

```bash
# repo root — in-memory store, no DATABASE_URL
npm run dev:memory

# other terminal
cd dashboard
VITE_EVENTS_API_URL=http://127.0.0.1:3000 npm run dev
```

The Events tab stays reverse-chronological, listens on SSE, filters by channel, debounces search by 300ms, paginates (50 / 100 / all), and writes `page`, `perPage`, `channel`, and `q` into the URL for bookmarking. The Charts tab (`?tab=charts`) aggregates that same filtered event store (line / doughnut / per-channel bars). The Market Insights tab polls `GET /api/insights` on mount and every **15 seconds** (`?tab=insights`). Click a KPI card to open that topic’s analysis (Esc or Close returns to the grid). Counselors can deep-link `?tab=insights&insight=<id>`. The Playground tab (`?tab=playground`) is a mock-ingest panel: form → live `fetch()` preview → real `POST /api/events`. Fill Sample cycles five named payloads in `dashboard/src/playgroundSamples.ts`; Reset returns empty defaults. Bulk synthetic BLS/O*NET-style seed: `prompts/MOCK_INGESTION_SCRIPT_PROMPT.md` (pointer: `scripts/mock-ingest-from-prompt.md`).

### `events` CLI

Standalone package in `cli/` (`cli/README.md`). Push a row without writing curl JSON:

```bash
node cli/src/events.js push \
  --channel university \
  --title "CS starting salaries up in metro X" \
  --description "optional" \
  --icon "📈" \
  --tags college_students,parents
```

`--icon` maps to API `emoji`. `--tags` is a comma-separated list. Base URL is `--api-url` or `EVENTS_API_URL`, default `https://hardcall-api.onrender.com`. Prints the 201 JSON; exits non-zero on errors.

```bash
cd cli && npx --yes . push --channel trade --title "HVAC demand"
cd cli && npm link   # then: events push --channel ...
```

Invalid channel, title, tags, lengths, or unknown keys return:

```json
{ "error": "validation_failed", "details": [{ "field": "title", "rule": "min_length" }] }
```

(`rule` values come from Orion — e.g. `length_1_200`, `enum`, `unknown_key`.) Wrong `Content-Type` is `415`. Persist failures are `500` with `{ "error": "persist_failed" }` (no internals).

## Deploy (always-on)

Point the host at this repo, set `DATABASE_URL` (and `PORT` if the platform injects one — the server already reads `PORT`), run migrate on release, then start.

**Render**

Render sets `NODE_ENV=production` during install, which omits `devDependencies`. `typescript`, `@types/node`, and `@types/pg` live in `dependencies` so `tsc` still runs. `npm run migrate` uses the compiled `dist/migrate.js` (no `tsx` at deploy time).

1. New Web Service from this GitHub repo.
2. Build: `npm ci && npm run build`
3. Start: `npm start`
4. Environment: `DATABASE_URL` = Neon or Supabase pooler URL. **Production:** `HARDCALL_ALLOW_DEMO=false`.
5. Release / pre-deploy command: optional. **`npm start` applies pending migrations before listen** (pooler-safe). Paste 006/007 in Supabase only if boot logs show migrate failed.
6. Health check path: `/health`
7. Add a **cron** service: `node dist/ingest/cli.js --source all` (see `docs/DEPLOY.md` and `render.yaml`)

If you prefer to keep compilers in `devDependencies`, override the install with:

`NPM_CONFIG_PRODUCTION=false npm ci && npm run build`

**Railway**

1. New project → deploy from GitHub.
2. Add `DATABASE_URL` (Neon or Supabase pooler). Railway’s `PORT` is picked up automatically.
3. Build command: `npm ci && npm run build`
4. Start command: `npm start`
5. Release command: `npm run migrate`

**Fly.io**

```bash
fly launch --no-deploy
fly secrets set DATABASE_URL="postgresql://..."
fly ssh console -C "npm run migrate"   # or a release_command in fly.toml
fly deploy
```

`Dockerfile` is a multi-stage Node 22 image (`npm start` equivalent: `node dist/server.js`). Set `PORT` to the platform’s listen port if it is not 3000.

After deploy, `GET https://<host>/health` should return `{ "ok": true }`. Then POST a fixture event and confirm the row in Neon or Supabase.

## Dashboard production notes

See `dashboard/README.md` for the full checklist. Short version:

- Celestial brand lives in the dashboard only (see `BRAND.md`). Tokens, Unbounded / DM Sans / IBM Plex Mono, locked celestial-map mark (`dashboard/public/logo.png`) and hero (`dashboard/public/banner-celestial.png`). Do not ship event-horizon, supernova, protostar, or the old geometric amber H. Keep `hardcall` out of routes, DDL, and status enums.
- **Render free** has no release command. The web process applies pending `migrations/*.sql` at boot (held client, one statement at a time). Paste 006/007 in Supabase only if those logs show migrate failed; `GET /api/insights` otherwise falls back to pre-006 columns (empty list, no invented KPIs). Paid Render / Railway / Fly can still set a release command.

## Out of scope (later)

Hosted dashboard (static on Vercel), scrapers, ingest auth, and multi-instance stream fan-out (today’s hub is in-process).

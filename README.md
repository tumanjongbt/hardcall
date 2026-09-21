# Hardcall

Real-time career intelligence pipeline — education ROI and automation resilience.

Tagline: *the call that shapes your orbit.*

Phase 1 is the always-on ingest API and cloud Postgres store. Scrapers and data sources `POST /api/events`. Phase 1.5 adds a live SSE stream and a standalone `events` CLI. Phase 2 adds `GET /api/events` (history) and a local dashboard that filters, searches, paginates, and stays on the live stream.

## What ships

| Piece | Path |
| --- | --- |
| Protostar migration | `migrations/001_events.sql` |
| Orion request validation | `src/events_validate.js` |
| HTTP contracts | `contracts/POST_api_events.md`, `contracts/GET_api_events.md`, `contracts/GET_api_events_stream.md` |
| TypeScript API | `src/app.ts`, `src/server.ts`, `src/sse_hub.ts` |
| `events` CLI | `cli/` (own package; see `cli/README.md`) |
| Dashboard | `dashboard/` (Vite; see `dashboard/README.md`) |

Table name is `events`. Schema identifiers stay product-neutral (no `hardcall` in DDL, routes, or error codes).

Ingest is **public** this phase (no API key). Treat that as a Phase 1b follow-up if you need a header later.

## Event shape

Required: `channel`, `title`. Optional: `description`, `emoji`, `tags`. Server sets `id` and `created_at`.

**Channels:** `university` · `community_college` · `trade` · `apprenticeship` · `automation`

**Stakeholder tags:** `high_school_students` · `college_students` · `parents` · `career_counselors` · `workforce_training_managers`

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
npm run migrate    # applies migrations/001_events.sql once
```

`schema_migrations` records `001_events` so the runner is idempotent. Re-running is a no-op after the first apply.

The migration creates `events` plus:

- `events_created_at_desc_idx` — `(created_at DESC, id DESC)`
- `events_channel_created_at_idx` — `(channel, created_at DESC)`
- `events_tags_gin_idx` — GIN on `tags`

Empty titles and empty-string optionals are illegal in the table. The API trims and turns blank `description` / `emoji` into `null` before insert.

## Run

```bash
npm run dev      # tsx watch, local
npm test         # Orion unit tests + HTTP contract tests
npm run build && npm start
```

- `GET /health` → `{ "ok": true }`
- `POST /api/events` → `201` + stored row, or `400` / `415` / `500` per the contract
- `GET /api/events` → `{ "events": [...] }` newest-first (`created_at DESC`, `id DESC`); optional `?channel=` and `?limit=` (default/max 1000)
- `GET /api/events/stream` → SSE (`text/event-stream`); each new insert is an SSE `message` whose JSON matches the stored row

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS "http://127.0.0.1:3000/api/events?channel=trade&limit=50"

curl -sS -X POST http://127.0.0.1:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "university",
    "title": "CS starting salaries up in metro X",
    "description": "optional",
    "emoji": "📈",
    "tags": ["college_students", "parents"]
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
  console.log(row.id, row.channel, row.title);
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

Default API base is `https://hardcall-api.onrender.com` (`VITE_EVENTS_API_URL`). After this branch is merged, Render must redeploy before production `GET /api/events` exists. Until then, point the dashboard at a local API:

```bash
# repo root — in-memory store, no DATABASE_URL
npm run dev:memory

# other terminal
cd dashboard
VITE_EVENTS_API_URL=http://127.0.0.1:3000 npm run dev
```

The feed stays reverse-chronological, listens on SSE, filters by channel, debounces search by 300ms, paginates (50 / 100 / all), and writes `page`, `perPage`, `channel`, and `q` into the URL for bookmarking.

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
4. Environment: `DATABASE_URL` = Neon or Supabase pooler URL.
5. Release / pre-deploy command: `npm run migrate`
6. Health check path: `/health`

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

## Out of scope (later)

Hosted dashboard (static on Vercel), charts, scrapers, ingest auth, and multi-instance stream fan-out (today’s hub is in-process).

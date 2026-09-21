# Hardcall

Real-time career intelligence pipeline — education ROI and automation resilience.

Tagline: *the call that shapes your orbit.*

Phase 1 is the always-on ingest API and cloud Postgres store. Scrapers and data sources `POST /api/events`. The dashboard is later.

## What ships

| Piece | Path |
| --- | --- |
| Protostar migration | `migrations/001_events.sql` |
| Orion request validation | `src/events_validate.js` |
| HTTP contract | `contracts/POST_api_events.md` |
| TypeScript API | `src/app.ts`, `src/server.ts` |

Table name is `events`. Schema identifiers stay product-neutral (no `hardcall` in DDL, routes, or error codes).

Ingest is **public** this phase (no API key). Treat that as a Phase 1b follow-up if you need a header later.

## Event shape

Required: `channel`, `title`. Optional: `description`, `emoji`, `tags`. Server sets `id` and `created_at`.

**Channels:** `university` · `community_college` · `trade` · `apprenticeship` · `automation`

**Stakeholder tags:** `high_school_students` · `college_students` · `parents` · `career_counselors` · `workforce_training_managers`

## Neon + `DATABASE_URL`

1. Create a Neon project ([neon.tech](https://neon.tech)) — Postgres 16+ is fine.
2. Copy the connection string. Use `sslmode=require`.
3. For `npm run migrate`, prefer Neon’s **direct** host (not the `-pooler` host) so `CREATE INDEX` / `CREATE TYPE` are not sitting behind transaction-pooling limits.
4. For the running API, the pooled connection string is fine.

Copy `.env.example` to `.env` locally. Only `.env.example` is committed.

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
PORT=3000
HOST=0.0.0.0
```

## Migrate (Protostar)

```bash
npm install
npx tsc --noEmit   # optional typecheck
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

```bash
curl -sS http://127.0.0.1:3000/health

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

Invalid channel, title, tags, lengths, or unknown keys return:

```json
{ "error": "validation_failed", "details": [{ "field": "title", "rule": "min_length" }] }
```

(`rule` values come from Orion — e.g. `length_1_200`, `enum`, `unknown_key`.) Wrong `Content-Type` is `415`. Persist failures are `500` with `{ "error": "persist_failed" }` (no internals).

## Deploy (always-on)

Point the host at this repo, set `DATABASE_URL` (and `PORT` if the platform injects one — the server already reads `PORT`), run migrate on release, then start.

**Render**

1. New Web Service from this GitHub repo.
2. Build: `npm ci && npm run build`
3. Start: `npm start`
4. Environment: `DATABASE_URL` = Neon URL.
5. Release / pre-deploy command: `npm run migrate`
6. Health check path: `/health`

**Railway**

1. New project → deploy from GitHub.
2. Add `DATABASE_URL` (Neon). Railway’s `PORT` is picked up automatically.
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

After deploy, `GET https://<host>/health` should return `{ "ok": true }`. Then POST a fixture event and confirm the row in Neon.

## Out of scope (later)

Dashboard / feed / charts, scrapers, and ingest auth.

# GET /api/events/stream

Phase 1.5 — live event stream for listening clients. Neutral path (no `hardcall`). In-memory fan-out on a single API process.

SSE connection status is not the same as data provenance. A connected pipe can still be carrying `synthetic` / `playground` / `cli` rows. `bls` / `onet` remain reserved until locked ingest auth — anonymous `POST /api/events` cannot mint them.

## Request

`Accept: text/event-stream` (optional; the response is SSE regardless).

No query params and no auth this phase. The connection stays open until the client disconnects.

## Response

`200` · `Content-Type: text/event-stream`

On connect:

```
retry: 5000

: connected

```

Each newly stored row from `POST /api/events` is broadcast immediately as an SSE `message` whose `data` is the same JSON as the 201 body (including `source`, `source_url`, `fetched_at`):

```
event: message
data: {"id":"550e8400-e29b-41d4-a716-446655440000","channel":"university","title":"CS starting salaries up in metro X","description":null,"emoji":"📈","tags":["college_students","parents"],"created_at":"2026-09-20T23:56:00.000Z","source":"playground","source_url":null,"fetched_at":null}

```

Comment heartbeats (`: keepalive`) are written periodically so proxies (e.g. Render) are less likely to idle-timeout the socket. There is no replay of past rows.

## Status map

| condition | status |
|-----------|--------|
| stream opened | 200 |

Auth: public this phase. No `hardcall` in error codes or field names.

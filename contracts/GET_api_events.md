# GET /api/events

Phase 2 — public history list for the dashboard and other clients. Neutral path (no `hardcall`). Newest first.

Search, pagination, and bookmark URL state live on the client. This endpoint returns a bounded newest-first window so the client can filter in memory and prepend live SSE rows.

## Request

No auth this phase. `Content-Type` is not required.

| query | required | rules |
|-------|----------|-------|
| `channel` | no | omit or empty = all channels; otherwise one of: `university`, `community_college`, `trade`, `apprenticeship`, `automation` |
| `limit` | no | positive integer; default **1000**; values above 1000 are capped at 1000 |

```
GET /api/events
GET /api/events?channel=trade
GET /api/events?channel=trade&limit=200
```

## Response

**200 OK** · `Access-Control-Allow-Origin: *`

```json
{
  "events": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "channel": "university",
      "title": "CS starting salaries up in metro X",
      "description": null,
      "emoji": "📈",
      "tags": ["college_students", "parents"],
      "created_at": "2026-09-20T23:56:00.000Z",
      "source": "synthetic",
      "source_url": null,
      "fetched_at": null
    }
  ]
}
```

`source` is one of: `synthetic` \| `manual` \| `playground` \| `cli` \| `bls` \| `onet` \| `unknown`. Existing seed/mock rows were backfilled to `synthetic`. `bls` / `onet` remain reserved until locked ingest auth — anonymous `POST /api/events` cannot mint them.

Order is `created_at DESC`, then `id DESC`. There is no `q` parameter — clients search title, description, and tags on the returned set.

**400** validation — `{ "error": "validation_failed", "details": [ { "field": "channel", "rule": "enum" } ] }`

**500** persist failure (no leak of internals)

## Status map

| condition | status |
|-----------|--------|
| stored rows (possibly empty) | 200 `{ "events": [] }` when none |
| invalid `channel` or non-integer / `< 1` `limit` | 400 |
| DB/unavailable | 500 |

Auth: public this phase. No `hardcall` in error codes or field names.

CORS is open (`*`) so a local dashboard can read history from this origin.

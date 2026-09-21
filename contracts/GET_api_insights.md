# GET /api/insights

Public list for the dashboard 15s poll. Neutral path (no `hardcall`).

## Request

No auth this phase. `Content-Type` is not required. No query parameters.

```
GET /api/insights
```

## Response

**200 OK** · `Access-Control-Allow-Origin: *`

```json
{
  "insights": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Top Trade Income Growth",
      "value": "+18%",
      "detail": "Licensed electricians and HVAC techs still outpace degree-only paths.\nKeep a waitlist for night cohorts.",
      "source": "synthetic",
      "created_at": "2026-09-21T00:00:00.000Z",
      "updated_at": "2026-09-21T00:15:00.000Z"
    }
  ]
}
```

`detail` is always a string (empty when no analysis has been stored). `source` is one of: `synthetic` \| `manual` \| `bls` \| `onet` \| `unknown`. Existing KPI seeds were backfilled to `synthetic`. `bls` / `onet` remain reserved until locked ingest auth — anonymous `POST /api/insight` cannot mint them. Order is **`updated_at DESC`**, then **`title ASC`** (most recently refreshed KPI first).

**500** persist failure (no leak of internals)

## Status map

| condition | status |
|-----------|--------|
| stored rows (possibly empty) | 200 `{ "insights": [] }` when none |
| DB/unavailable | 500 |

Auth: public this phase. No `hardcall` in error codes or field names.

CORS is open (`*`) so the local dashboard can poll this origin every 15 seconds.

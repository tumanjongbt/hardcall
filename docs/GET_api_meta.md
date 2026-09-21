# GET /api/meta

Public status for the dashboard demo gate and warehouse counts. Neutral path (no `hardcall`).

## Request

```
GET /api/meta
```

No auth. `Content-Type` is not required.

## Response

**200 OK** · `Access-Control-Allow-Origin: *`

```json
{
  "ok": true,
  "allow_demo": false,
  "live_sources": ["bls", "onet", "scorecard", "apprenticeship_gov", "bls_ep"],
  "warehouse": {
    "institutions": 6243,
    "programs": 81504,
    "apprenticeship_sponsors": 47558,
    "occupations": 1016,
    "wage_observations": 800,
    "projections": 0,
    "latest_fetched_at": "2026-09-21T18:00:00.000Z"
  }
}
```

`allow_demo` is the server `HARDCALL_ALLOW_DEMO` flag (default **false** when `NODE_ENV=production`). The dashboard hides Playground and Admin when this is false.

Warehouse counts are `0` until `006_domain_warehouse` is applied and `npm run ingest` has run. A missing warehouse table does not fail this endpoint.

**500** is not used for missing tables; stats errors are swallowed to zeros.

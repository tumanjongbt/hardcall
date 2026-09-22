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
  "live_sources": ["bls", "onet", "scorecard", "apprenticeship_gov", "bls_ep", "ipeds", "careeronestop", "census", "bea", "fred"],
  "warehouse": {
    "institutions": 6243,
    "programs": 220800,
    "apprenticeship_sponsors": 47547,
    "occupations": 1016,
    "wage_observations": 1137,
    "projections": 832,
    "credentials": 1000,
    "licenses": 0,
    "certifications": 0,
    "econ_indicators": 0,
    "latest_fetched_at": "2026-09-22T00:33:26.884Z"
  },
  "feeds": [
    {
      "source": "fred",
      "label": "FRED",
      "cadence": "daily",
      "cadence_label": "Daily-ish. FRED series such as UNRATE and CPIAUCSL are pulled for the latest published observation, not a tick stream.",
      "source_url": "https://fred.stlouisfed.org/docs/api/fred/series_observations.html",
      "last_fetched_at": "2026-09-22T00:33:26.884Z",
      "rows": 2,
      "row_counts": { "econ_indicators": 2 },
      "status": "ok"
    }
  ]
}
```

`allow_demo` is the server `HARDCALL_ALLOW_DEMO` flag (default **false** when `NODE_ENV=production`). The dashboard hides Playground and Admin when this is false.

`feeds` is the same array as `GET /api/feeds`. `status` is `ok` (pulled inside the cadence window), `stale` (rows exist but `last_fetched_at` is older than that window), or `error` (no rows and no `fetched_at`). Cadence labels are honest: FRED is daily-ish; CareerOneStop is weekly; Census, BEA, Scorecard, OEWS, and Employment Projections are release-driven and still pulled on the ingest schedule so `fetched_at` stays current. They are not tick streams.

Warehouse counts are `0` until the matching migration is applied and `npm run ingest` has run. A missing warehouse table does not fail this endpoint and does not zero the tables that do exist.

**500** is not used for missing tables; stats errors are swallowed to zeros. List routes are documented in `contracts/GET_api_warehouse.md`.

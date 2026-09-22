# Warehouse read API

Public GET routes for the live US warehouse. No auth. Every row includes `source`, `source_url`, and `fetched_at`. These routes do not invent rows. A missing table returns an empty page (or a zero count), not a fabricated sample.

Default `limit` is **50**. Values above **200** are capped. `offset` is a non-negative integer up to 100000. Invalid `limit`, `offset`, `outlook`, `source`, `soc`, `cip`, `channel`, `q`, `state`, or `type` is **400**:

```json
{ "error": "validation_failed", "details": [{ "field": "outlook", "rule": "enum" }] }
```

`source` must be a warehouse source (`bls`, `onet`, `scorecard`, `apprenticeship_gov`, `bls_ep`, `ipeds`, `careeronestop`, `census`, `bea`, `fred`, `credential_engine`). `synthetic` is rejected. Anonymous `POST /api/events` and `POST /api/insight` still cannot mint reserved live sources. There is no `POST /api/ingest`.

`channel` is applied only where the table can support it honestly:

- institutions and programs: `university` or `community_college` (the college corpus is not split further). Any other channel returns `total: 0`.
- sponsors: `apprenticeship` only. Other channels return `total: 0`.
- occupations, wages, projections, credentials, licenses, certifications, econ: `channel` is ignored. Those tables have no channel column.

`outlook=grow` means `change_percent > 0`. `outlook=decline` means `change_percent < 0`. It filters projections only.

`soc` matches a code prefix after stripping a trailing `.00`, so `29-1141` matches `29-1141.00`.

## GET /api/warehouse

```json
{ "ok": true, "warehouse": { "institutions": 6243, "programs": 220800, "apprenticeship_sponsors": 47547, "occupations": 1016, "wage_observations": 1137, "projections": 832, "credentials": 0, "licenses": 0, "certifications": 0, "econ_indicators": 0, "latest_fetched_at": null } }
```

A down database is **500** `{ "error": "persist_failed" }`. `GET /api/meta` keeps the demo flag up and returns zeros if stats throw.

## GET /api/feeds

Also embedded on `GET /api/meta` as `feeds`.

```json
{
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

`status`: `ok` inside the pull window, `stale` when rows exist but `last_fetched_at` is older, `error` when that source has never been stored. Windows: daily 72 hours (FRED), weekly 10 days (CareerOneStop, Apprenticeship.gov), release-driven 14 days (Scorecard, OEWS, Employment Projections, O*NET, Census, BEA, Credential Engine). Release-driven sets are still pulled on the ingest schedule so `fetched_at` moves. OEWS is not a daily BLS time series.

## Lists

Each list is `{ "<key>": [rows], "limit", "offset", "total" }`. `total` is the filtered count. Provenance fields are on every row.

| Path | Key | Search `q` | Other filters |
| --- | --- | --- | --- |
| `/api/institutions` | `institutions` | name, city, unitid | `state`, `type` = control, `source`, `channel` |
| `/api/programs` | `programs` | institution, CIP title/code, credential title | `state` (institution join), `type` = credential level, `cip`, `source`, `channel` |
| `/api/sponsors` | `sponsors` | name, city, county | `state`, `type` = organization type, `source`, `channel` |
| `/api/occupations` | `occupations` | title, description, SOC | `soc`, `source` |
| `/api/wages` | `wages` | title, area, SOC | `state` (area code or name), `type` = area type, `soc`, `source` |
| `/api/projections` | `projections` | title, SOC, education | `outlook`, `soc`, `type` = typical education, `source`. Ordered by percent change descending. |
| `/api/credentials` | `credentials` | name, organization, description | `state`, `type` = credential type, `soc`, `cip`, `source` |
| `/api/licenses` | `licenses` | title, agency | `state`, `source` |
| `/api/certifications` | `certifications` | name, organization | `type` = cert type, `source` |
| `/api/econ` | `econ` | title, series, geography | `state` matches `geo_id` or `geo_name`, `source` = `census` \| `bea` \| `fred` |

Programs include `state` from the joined institution when that row exists. Econ Census rows store published ACS variables (`B19013_001E`, `B23025_003E`, `B23025_005E`, and the other pulled measures). They do not store a rate computed by this API.

Numeric columns are JSON numbers. `fetched_at` is ISO-8601. A query failure other than a missing table or column is **500** `{ "error": "persist_failed" }`.

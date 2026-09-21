# POST /api/events

Phase 1 — public ingest. Neutral path (no `hardcall`). Shape mirrors Protostar `events`.

## Request

`Content-Type: application/json`

```json
{
  "channel": "university",
  "title": "CS starting salaries up in metro X",
  "description": "optional",
  "emoji": "📈",
  "tags": ["college_students", "parents"],
  "source": "manual",
  "source_url": null,
  "fetched_at": null
}
```

| field | required | rules |
|-------|----------|-------|
| `channel` | yes | one of: `university`, `community_college`, `trade`, `apprenticeship`, `automation` |
| `title` | yes | string; trim; length 1–200 after trim |
| `description` | no | omit or null; if present: trim; empty → null; else length 1–4000 |
| `emoji` | no | omit or null; if present: trim; empty → null; else length 1–16 |
| `tags` | no | array; default `[]`; each item one of: `high_school_students`, `college_students`, `parents`, `career_counselors`, `workforce_training_managers`; reject duplicates |
| `source` | no | **Anonymous public POST may send only:** `synthetic` \| `manual` \| `playground` \| `cli` \| `unknown`. **Omitted anonymous POST defaults to `manual`.** Playground must send `playground`. CLI sends `cli`. Seed/mock ingest should send `synthetic`. Reserved live sources (`bls` \| `onet` \| `scorecard` \| `apprenticeship_gov` \| `bls_ep`) remain in the stored/GET enum for server-side ingest — **anonymous clients cannot set them** (400 `source` / `reserved`). When `HARDCALL_ALLOW_DEMO=false`, `synthetic` / `playground` / `cli` are **403** `{ "error": "demo_disabled" }`. |
| `source_url` | no | omit or null; if present: trim; empty → null; else must be `http://` or `https://` (max 2000) |
| `fetched_at` | no | omit or null; if present: ISO 8601 date or datetime; empty → null; stored as UTC ISO |
| `created_at` | no | omit or null; if present: ISO 8601 date or datetime; empty → server `now()`; **insert only** — used as the stored timestamp when valid |

Reject unknown top-level keys (400). Server sets `id`. Server sets `created_at` to now unless the client sent a valid `created_at`.

## Responses

After a successful insert the same row is broadcast on `GET /api/events/stream` (see that contract).

**201 Created**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "university",
  "title": "CS starting salaries up in metro X",
  "description": null,
  "emoji": "📈",
  "tags": ["college_students", "parents"],
  "created_at": "2026-09-20T23:56:00.000Z",
  "source": "manual",
  "source_url": null,
  "fetched_at": null
}
```

**400** validation — `{ "error": "validation_failed", "details": [ { "field": "title", "rule": "min_length" } ] }`

Unknown `source` uses `rule: "enum"`. Anonymous reserved live `source` uses `rule: "reserved"`. Invalid `source_url` uses `rule: "http_url"`. Invalid `fetched_at` or `created_at` uses `rule: "iso_datetime"`.

**415** non-JSON body

**500** persist failure (no leak of internals)

## Status map

| condition | status |
|-----------|--------|
| valid body, stored | 201 |
| missing/invalid channel, title, tag, source, source_url, fetched_at, created_at, reserved live source, lengths, unknown keys, non-array tags | 400 |
| demo source while `HARDCALL_ALLOW_DEMO=false` | 403 `{ "error": "demo_disabled" }` |
| wrong content-type | 415 |
| DB/unavailable | 500 |

Auth: public this phase (Supernova). No `hardcall` in error codes or field names.

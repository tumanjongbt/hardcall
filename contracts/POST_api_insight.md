# POST /api/insight

Public upsert for a market-insight KPI. Neutral path (no `hardcall`). Exact `title` is the upsert key.

## Request

`Content-Type: application/json`

```json
{
  "title": "Top Trade Income Growth",
  "value": "+18%",
  "detail": "Licensed electricians and HVAC techs still outpace degree-only paths.\nKeep a waitlist for night cohorts.",
  "source": "synthetic"
}
```

| field | required | rules |
|-------|----------|-------|
| `title` | yes | string; trim; length 1–200 after trim; exact match is the upsert key |
| `value` | yes | string; trim; length 1–500 after trim |
| `detail` | no | string; trim; length 0–8000 after trim; omitted on **update** leaves the stored body unchanged |
| `source` | no | **Anonymous public POST may send only:** `synthetic` \| `manual` \| `unknown` (no `playground` / `cli`). Omitted on **insert** stores `synthetic`. Omitted on **update** keeps the stored source. Seed scripts should send `synthetic`. Reserved live sources (`bls` \| `onet` \| `scorecard` \| `apprenticeship_gov` \| `bls_ep` \| `ipeds` \| `careeronestop` \| `census` \| `bea` \| `fred`) remain in the stored/GET enum for server-side ingest — **anonymous clients cannot set them** (400 `source` / `reserved`). When demo is off, synthetic (including omitted insert source) is **403** `demo_disabled`. |
| `source_url` | no | omit or null; if present: `http(s)` URL |
| `fetched_at` | no | omit or null; if present: ISO 8601 |

Reject unknown top-level keys (400). Server sets `id`, `created_at`, `updated_at` on insert. On update, `id` and `created_at` stay; `value` and `updated_at` change; `detail` and `source` change only when the key is sent.

A new title with no `detail` stores `""`. Sending `detail` as blank after trim writes `""` (that is an explicit wipe). Omitting the key on a later POST does **not** wipe.

## Responses

**201 Created** — title was new

**200 OK** — title already existed; `value` (and `detail` / `source` when sent) plus `updated_at` were replaced

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Top Trade Income Growth",
  "value": "+18%",
  "detail": "Licensed electricians and HVAC techs still outpace degree-only paths.\nKeep a waitlist for night cohorts.",
  "source": "synthetic",
  "created_at": "2026-09-21T00:00:00.000Z",
  "updated_at": "2026-09-21T00:15:00.000Z"
}
```

**400** validation — `{ "error": "validation_failed", "details": [ { "field": "title", "rule": "length_1_200" } ] }`

`detail` over 8000 characters after trim uses `rule: "length_0_8000"`. Unknown `source` uses `rule: "enum"`. Anonymous `source` of `bls` or `onet` uses `rule: "reserved"`.

**415** non-JSON body (`Content-Type` not `application/json`, or invalid JSON)

**500** persist failure (no leak of internals)

## Status map

| condition | status |
|-----------|--------|
| valid body, inserted | 201 |
| valid body, updated existing title | 200 |
| missing/invalid title or value, lengths, unknown keys, non-object, invalid or reserved live source | 400 |
| demo source while `HARDCALL_ALLOW_DEMO=false` | 403 `{ "error": "demo_disabled" }` |
| wrong content-type / non-JSON | 415 |
| DB/unavailable | 500 |

Auth: public this phase. No `hardcall` in error codes or field names.

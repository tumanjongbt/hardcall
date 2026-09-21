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
  "tags": ["college_students", "parents"]
}
```

| field | required | rules |
|-------|----------|-------|
| `channel` | yes | one of: `university`, `community_college`, `trade`, `apprenticeship`, `automation` |
| `title` | yes | string; trim; length 1–200 after trim |
| `description` | no | omit or null; if present: trim; empty → null; else length 1–4000 |
| `emoji` | no | omit or null; if present: trim; empty → null; else length 1–16 |
| `tags` | no | array; default `[]`; each item one of: `high_school_students`, `college_students`, `parents`, `career_counselors`, `workforce_training_managers`; reject duplicates |

Reject unknown top-level keys (400). Server sets `id`, `created_at`.

## Responses

**201 Created**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "university",
  "title": "CS starting salaries up in metro X",
  "description": null,
  "emoji": "📈",
  "tags": ["college_students", "parents"],
  "created_at": "2026-09-20T23:56:00.000Z"
}
```

**400** validation — `{ "error": "validation_failed", "details": [ { "field": "title", "rule": "min_length" } ] }`

**415** non-JSON body

**500** persist failure (no leak of internals)

## Status map

| condition | status |
|-----------|--------|
| valid body, stored | 201 |
| missing/invalid channel, title, tag, lengths, unknown keys, non-array tags | 400 |
| wrong content-type | 415 |
| DB/unavailable | 500 |

Auth: public this phase (Supernova). No `hardcall` in error codes or field names.

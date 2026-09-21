# Mock ingestion script prompt

Self-contained instructions for an agent or operator to **populate the Hardcall cloud database** with dozens of realistic career/labor events. Execute end-to-end without extra product context.

These records are **synthetic / demo**. They are *inspired by* public BLS Occupational Outlook Handbook and O*NET-style signals (wage growth, employment outlook, typical education, automation/technology risk). **Do not call live BLS or O*NET APIs and do not use API keys** unless a later adapter is explicitly wired. Invent plausible numbers in public-statistic ranges; never claim the payload is an official BLS or O*NET extract.

---

## Goal

1. Generate **40–80** unique events (target **60** unless the operator names another count in that range).
2. Cover **all five channels**.
3. `POST` each event to `POST {EVENTS_API_URL}/api/events`.
4. Confirm stored rows via `GET {EVENTS_API_URL}/api/events?limit=1000`.
5. Stop with a short report: posted count, skipped/failed count, channel histogram, sample ids.

## API

| | |
| --- | --- |
| Base | `EVENTS_API_URL` env, default `https://hardcall-api.onrender.com` (no trailing slash) |
| Method | `POST` |
| Path | `/api/events` |
| Header | `Content-Type: application/json` |
| Auth | none (public ingest this phase) |

Health check first:

```bash
curl -sS "${EVENTS_API_URL:-https://hardcall-api.onrender.com}/health"
```

Expect `{ "ok": true }`. If that fails, stop.

### JSON body (exact keys only)

Unknown top-level keys → **400**. Server sets `id` and `created_at`. Success is **201** (treat **200** as success if it appears). Always send `source: "synthetic"` so counselors never mistake these rows for live BLS/O*NET.

```json
{
  "channel": "university",
  "title": "CS starting salaries up in metro X",
  "description": "optional",
  "emoji": "📈",
  "tags": ["college_students", "parents"],
  "source": "synthetic"
}
```

| field | required | rules |
| --- | --- | --- |
| `channel` | yes | exactly one of: `university`, `community_college`, `trade`, `apprenticeship`, `automation` |
| `title` | yes | string; trim; length **1–200** |
| `description` | no | omit when empty; else trim; length **1–4000** |
| `emoji` | no | omit when empty; else trim; length **1–16** (a single emoji is enough) |
| `tags` | no | array, default `[]`; unique; each item one of the stakeholder tags below |
| `source` | yes for this seed | exactly `synthetic` (do **not** send `bls` or `onet`) |

**Stakeholder tags (only these):**

- `high_school_students`
- `college_students`
- `parents`
- `career_counselors`
- `workforce_training_managers`

Do **not** send `id`, `created_at`, `bls`, `onet`, or any other key.

### POST example

```bash
API="${EVENTS_API_URL:-https://hardcall-api.onrender.com}"
curl -sS -X POST "$API/api/events" \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "trade",
    "title": "HVAC techs: BLS-style wage growth still leads licensed trades",
    "description": "Synthetic demo: occupational wage growth remains elevated for HVAC and electricians versus clerical work. Typical path: certificate or apprenticeship, not a four-year degree. Automation risk is low for on-site diagnostics.",
    "emoji": "🔧",
    "tags": ["high_school_students", "career_counselors"],
    "source": "synthetic"
  }'
```

A Node one-shot is also valid:

```js
const API = (process.env.EVENTS_API_URL || "https://hardcall-api.onrender.com").replace(/\/+$/, "");
const res = await fetch(`${API}/api/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

On **201/200**, parse JSON and record `id`, `channel`, `title`. On **400**, read `{ error, details }` and fix that payload (do not retry the same invalid body). On **415**, you forgot `Content-Type: application/json`. On **5xx**, wait 1s, retry up to 3 times, then skip and continue.

Pace: ~50–150 ms between posts so a free host is not flooded. Sequential is fine; small concurrency (≤4) is allowed.

---

## Channel mix (all five required)

Use **every** channel at least **6** times. Aim for a balanced mix, not a single-channel dump:

| channel | share | what the copy should feel like |
| --- | --- | --- |
| `university` | ~20% | bachelor’s / graduate ROI, sticker vs net price, major-to-occupation, starting salaries |
| `community_college` | ~20% | 2-year + cert stacks, transfer, short-path ROI, allied health, IT support |
| `trade` | ~20% | licensed trades, tools-in-hand, waitlists, wage premiums (HVAC, electric, welding, plumbing) |
| `apprenticeship` | ~20% | paid related instruction, journey wage, union/non-union, helper hours |
| `automation` | ~20% | displacement risk, complementary tech, which tasks models eat, resilient occupations |

If the operator asked for 40, still hit ≥6 per channel. If 80, keep the same proportions.

## Tag mix

- Each event: **1–3 tags** (never duplicates).
- Across the batch, use **all five tags** at least once.
- Guidance:
  - high school / dual enrollment / first-job → `high_school_students` (± `parents`, `career_counselors`)
  - bachelor’s, internships, major choice → `college_students` (± `parents`)
  - net price, “is this degree worth it” → include `parents`
  - counselor briefing, pathway maps → `career_counselors`
  - employer upskilling, apprenticeships, displaced clerks → `workforce_training_managers`

## Title / description quality bar

**Titles (required):** specific, scannable, ≤200 chars. Name an occupation or program *and* a signal (wage, outlook, seats, risk, credential). No clickbait, no all-caps, no “Lorem ipsum”.

Good: `Electrician journey wages outpace clerical pay in this metro (synthetic BLS-style)`  
Bad: `Jobs` / `Update` / `BLS data`

**Descriptions:** 1–4 sentences, 80–600 characters typical. Must include **at least two** of:

- wage or employment-growth language (percent or dollar ranges that look like OOH tables)
- typical education / credential (HS diploma, cert, apprenticeship, associate, bachelor’s)
- outlook or openings (growth, replacement, waitlist, shortage)
- automation / technology risk (high, mixed, complementary tools — not sci-fi)

Label the copy as synthetic when a reader could confuse it with an official release, e.g. start with `Synthetic demo:` or end with `(demo; not a BLS extract)`.

**Emoji:** optional; one glyph matching the channel (`🎓` `🏫` `🔧` `🛠️` `🤖` `📈` `⚠️`). Omit rather than sending empty string.

**Uniqueness:** no duplicate titles. Vary metros, occupations, and signals. Occupations to draw from (mix, do not use only tech): registered nurse, electrician, HVAC, welder, plumber, CNC, dental hygienist, truck driver, software developer, data entry/clerical, customer service, machinist, solar installer, wind tech, carpenter, radiologic tech, cybersecurity analyst, teaching assistant, licensed practical nurse, industrial mechanic.

## BLS / O*NET-style signals (synthetic)

Invent values in believable public ranges. Examples of the *kind* of claim — replace with your own numbers:

- Employment change “much faster than average” vs “decline”
- Median annual wage bands (e.g. trades $50k–$80k, some professional $80k–$130k)
- Typical education: none, HS, some college, associate, bachelor’s, apprenticeship
- On-the-job training: none / moderate / long-term / apprenticeship
- Automation: routine cognitive/clerical high risk; hands-on licensed trades and care work lower risk; AI as a complement in software/analysis

Do not paste copyrighted OOH paragraphs. Write original counselor-facing sentences.

## Execution recipe (do this)

1. Resolve `API = (process.env.EVENTS_API_URL || "https://hardcall-api.onrender.com").replace(/\/+$/, "")`.
2. `GET ${API}/health` — abort if not ok.
3. Build an array of 40–80 payload objects in memory that satisfy the mix and quality bar.
4. For each payload, `POST ${API}/api/events` with the JSON above. Collect `{ id, title, channel, status }`.
5. After the loop, `GET ${API}/api/events?limit=1000` and count how many of your titles/ids are present.
6. Print a summary:

```
posted: 60
failed: 0
channels: university=12 community_college=12 trade=12 apprenticeship=12 automation=12
sample ids: …
verify: GET /api/events contains N of the posted titles
```

7. If more than ~10% failed validation, fix the generator (enum, length, unknown keys) and POST only the missing ones. Do not blindly duplicate already-201 titles.

Optional local check with the CLI (same contract):

```bash
node cli/src/events.js push \
  --channel trade \
  --title "Welding night seats just opened" \
  --description "Synthetic demo: fabrication shops still posting night cohorts." \
  --icon "🔧" \
  --tags high_school_students,career_counselors \
  --api-url "${EVENTS_API_URL:-https://hardcall-api.onrender.com}"
```

## Out of scope

- No new backend routes
- No BLS/O*NET API keys or live scrapers
- No `POST /api/insight` unless the operator also asked for KPIs
- No `hardcall` in JSON field names or error handling — the contract is channel/title/description/emoji/tags/source

## Done when

- 40–80 events exist on the target API
- All five channels and all five tags appear
- Titles/descriptions meet the quality bar and are marked synthetic
- Failures are reported, not hidden

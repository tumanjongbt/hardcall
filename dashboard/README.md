# Hardcall dashboard

Local feed for career-market events, a **Charts** tab for the same telemetry, a **Market Insights** KPI tab, and a **Playground** tab that posts mock scraper payloads to `POST /api/events`. Logic lives in `src/*.ts` (Playground payload + highlighter in `src/playground.ts`); chart bucketing lives in `src/charts/transforms.ts`; Chart.js lifecycle lives in `src/charts/renderCharts.ts`; presentation lives in `src/styles.css` and the markup in `index.html`.

Brand: void `#05010A`, nebula `#5B2CFF`, corona `#FFB020`, signal `#2EE6A6`, paper `#F5F2EA`.

## Run locally

```bash
cd dashboard
npm install
npm run dev
```

Open the Vite URL (default `http://127.0.0.1:5173`). The Events tab reads history from `GET {API}/api/events` and listens on `GET {API}/api/events/stream`. Charts (`?tab=charts`) use that same in-memory store. The Market Insights tab polls `GET {API}/api/insights` on mount and every **15 seconds**. KPI cards are buttons: click (or Enter / Space) opens a side drawer with that tile’s `detail` analysis. Esc or Close returns to the grid. An open drawer stays open across the 15s poll and updates in place if that id is still present. Playground (`?tab=playground`) maps the event contract to a form, highlights the exact native `fetch()` a scraper would run (Copy copies that snippet), and Submit posts that JSON to `{API}/api/events`. **Fill Sample** cycles five named catalog entries in `src/playgroundSamples.ts` (trade overtime, university tuition, apprenticeship seats, community-college cert, automation risk). **Reset** clears the form, the sample cursor, the error banner, and the success toast.

```bash
npm test
npm run build
```

## API base

`VITE_EVENTS_API_URL` — API **origin only**, no path. Default: `https://hardcall-api.onrender.com`.

```bash
# live Render API (GET /api/events after that service redeploys this branch)
npm run dev

# local API (needs DATABASE_URL) or the in-memory preview server
VITE_EVENTS_API_URL=http://127.0.0.1:3000 npm run dev
```

Copy `.env.example` to `.env` if you want the value sticky.

Until Render redeploys **this** commit, production `GET /api/events` is still 404. SSE already exists on the live API. Use a local API for history, or wait for the web service to pick up `GET /api/events`.

In-memory API (no Postgres) from the repo root:

```bash
npm install
npx tsx src/dev_memory_server.ts
```

Then run the dashboard with `VITE_EVENTS_API_URL=http://127.0.0.1:3000`.

## URL state

These query keys are written with `history.pushState` when a person changes filters or page (so Back works):

| key | default | meaning |
| --- | --- | --- |
| `tab` | omitted (`events`) | `events`, `charts`, `insights`, or `playground` (`insight=` also opens Market Insights) |
| `page` | `1` | 1-based page |
| `perPage` | `50` | `50`, `100`, or `all` |
| `channel` | omitted | `university` · `community_college` · `trade` · `apprenticeship` · `automation` |
| `q` | omitted | search over title, description, tags (300ms debounce) |
| `insight` | omitted | insight id; opens the analysis drawer on the Market Insights tab |
| `lens` | omitted (`All`) | Charts audience lens: `students` · `parents` · `counselors` · `workforce` (`stakeholder=` is an alias; raw tags like `career_counselors` also parse) |
| `range` | omitted (`30`) | Charts lookback: `7` · `14` · `30` · `90` (90-day history) |
| `forecast` | omitted (`14`) | Charts forward band: `14` or `30` days |
| `compare` | omitted (`trade,university`) | Two channels to compare, or `none` |

Example: `/?page=2&perPage=50&channel=trade&q=welding` · `/?tab=charts` · `/?tab=insights` · `/?tab=insights&insight=<id>` · `/?tab=playground`

Reload restores the same view. Changing channel, search, or per-page resets `page` to `1`.

## Manual proof

1. **Load feed** — newest events first.
2. **Channel filter** — Trade / University / All channels; URL gets `channel=`.
3. **Search debounce** — type quickly; the list and `q=` update only after 300ms idle.
4. **Pagination URL** — default 50/page; switch 100 and All; Next writes `page=2`.
5. **SSE flash** — keep the dashboard open and push an event:

```bash
node cli/src/events.js push \
  --channel trade \
  --title "Welding night seats just opened" \
  --icon "🔧" \
  --tags high_school_students \
  --api-url http://127.0.0.1:3000
```

The new card should slide/flash in at the top of page 1 when it matches the current filter.

6. **Charts tab (counselor workflow)** — open `?tab=charts`. You should see:

   - A mandatory **Not advice** chip (cannot be dismissed). The 14/30-day forecast band is telemetry, not a path recommendation.
   - **Audience lens** (All / Students / Parents / Counselors / Workforce) — Students unions `high_school_students` + `college_students`. URL writes `lens=`.
   - **Time range** 7 / 14 / 30 / **90** days (default 30). All time-series, the stacked mix, heat, ranks, and the forecast input recompute. URL writes `range=`.
   - **Forecast horizon** 14- or 30-day band overlaid on the activity line. URL writes `forecast=`.
   - **Path compare** — select two channels (default Trade vs University). Dual-series line answers “which path is drawing more signal right now?”
   - Existing line / doughnut / per-channel bars, plus stacked composition, stakeholder bars, automation-resilience split, weekday heat, and a data view with volume, share, DoD/WoW, and a one-line **so what**.
   - Change lens, range, channel, or search: after 300ms every chart **and** the data view update together. Share the URL.

   Counselor recipe: set lens to **Students** (or **Parents**), range **30** (or **90** if you need the long hist), compare **Trade vs University**, and read the data-view “so what” before the family meeting. Treat automation resilience as a check on displacement risk, not a verdict.

7. **Market Insights tab** — switch to Market Insights (`?tab=insights`). KPI cards should appear (empty until `POST /api/insight`). Click a card: the drawer shows title, KPI value, and `detail` (or “No analysis yet for this insight.”). Esc / Close returns to the grid. Reload `?tab=insights&insight=<id>` should reopen that tile. Wait ~15s or POST a new/updated title and confirm the grid refreshes on the next poll without closing an open drawer.

```bash
curl -sS -X POST http://127.0.0.1:3000/api/insight \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Top Trade Income Growth", "value": "+18%", "detail": "Electricians and HVAC still lead wage growth." }'
```

After Bernard pastes `migrations/003_insights_detail.sql` in Supabase, seed analysis for the eight live KPI titles:

```bash
EVENTS_API_URL=https://hardcall-api.onrender.com node scripts/seed-insight-details.js
```

8. **Playground tab** — open `?tab=playground`.
   - Change channel, title, description, emoji, and stakeholder tags: the syntax-highlighted `fetch()` block must rewrite on every input (URL `${API}/api/events`, method POST, `Content-Type: application/json` only — no `Authorization` / `apikey`, JSON body matching the form).
   - **Fill Sample** applies sample 1/5 (Trade overtime) into the left form; the preview updates. Click again to cycle 2/5 University tuition → 3/5 Apprenticeship seats → 4/5 Community college cert → 5/5 Automation risk → wrap. The active label is `Sample N/5: <name>`.
   - Icon chips set `emoji`; the text field still accepts a custom icon.
   - **Reset** empties title/description/emoji/tags (channel back to University), clears the sample label, hides the error banner, and dismisses the toast. Preview rewrites to the empty payload.
   - **Copy** copies the current snippet.
   - Submit a valid title: the button disables while in flight, then a toast card shows the new id + title (201/200). Submit an empty title: an inline error banner shows HTTP status + validation message. Double-click Submit should not fire two posts. Switch to Events: the new row should appear (SSE or the playground prepend).

Live POST proof (public ingest, no auth headers):

```bash
curl -sS -D - -X POST https://hardcall-api.onrender.com/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "trade",
    "title": "Electrician overtime wages rise 14% in Q3",
    "description": "Journeyman electricians in several metro markets are seeing overtime premiums as construction backlogs stretch into fall.",
    "emoji": "🔧",
    "tags": ["high_school_students", "workforce_training_managers"]
  }'
```

Expect `HTTP/1.1 201` and JSON with `id` + the same title. The playground Submit button fires this same body.

Bulk synthetic records (BLS/O*NET-style demo, no live keys): `prompts/MOCK_INGESTION_SCRIPT_PROMPT.md` — pointer `scripts/mock-ingest-from-prompt.md`.

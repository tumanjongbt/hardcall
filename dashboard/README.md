# Hardcall dashboard

Local feed for career-market events, a **Charts** tab for the same telemetry, a **Market Insights** KPI tab, and a **Playground** tab that posts mock scraper payloads to `POST /api/events`. Logic lives in `src/*.ts` (Playground payload + highlighter in `src/playground.ts`); chart bucketing lives in `src/charts/transforms.ts`; Chart.js lifecycle lives in `src/charts/renderCharts.ts`; presentation lives in `src/styles.css` and the markup in `index.html`.

Brand (v2 locked): void `#05010A`, nebula `#5B2CFF`, corona `#FFB020`, accretion `#FF4FBF`, signal `#2EE6A6`, paper `#F5F2EA`, mute `#8B8794`. Display **Unbounded ExtraBold**, UI **DM Sans**, data **IBM Plex Mono**. Masthead lockup: `public/logo.png` + HARDCALL + corona tagline *the call that shapes your orbit.* Events hero: `public/banner-celestial.png`. Product name stays out of API routes and status enums.

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

`VITE_EVENTS_API_URL` — API **origin only** (scheme + host[:port]). Paths, query strings, and non-http(s) values are ignored and the default origin is used. Default: `https://hardcall-api.onrender.com`.

This value is **public**. Vite inlines every `VITE_*` key into the static bundle. Do not put tokens, passwords, or `DATABASE_URL` here. The browser only fetches that configured origin (`/api/events`, `/api/events/stream`, `/api/insights`, `POST /api/events`, `POST /api/insight`).

The API answers CORS with `Access-Control-Allow-Origin: *` (plus `GET,POST,OPTIONS` and `Content-Type`) so a local Vite origin or a later hosted dashboard can read and post. Tighten that header when ingest auth lands.

```bash
# live Render API
npm run dev

# local API (needs DATABASE_URL) or the in-memory preview server
VITE_EVENTS_API_URL=http://127.0.0.1:3000 npm run dev
```

Copy `.env.example` to `.env` if you want the value sticky.

If history 404s, the Render web service has not picked up `GET /api/events` yet. SSE already exists on the live API. Point the dashboard at a local API, or wait for redeploy.

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

   - A one-line **decision statement** under the Charts title: which path is drawing signal, and is automation pressure rising?
   - Shared Events **channel chips + 300ms search**, then primary controls only: **Audience lens**, **Time range**, **Path compare** (two channels).
   - **Activity + forecast** and **Path compare** at the top of the viz stack, then a compact **so-what** table. Secondary mix / resilience / heat / per-path bars stay behind a closed **More views** disclosure.
   - A mandatory **Not advice** chip on the forecast (cannot be dismissed). Horizon chips (14/30) live on the activity card and write `forecast=`.
   - **Audience lens** (All / Students / Parents / Counselors / Workforce) — Students unions `high_school_students` + `college_students`. URL writes `lens=`.
   - **Time range** 7 / 14 / 30 / **90** days (default 30). URL writes `range=`.
   - **Path compare** — select two channels (default Trade vs University). If both selected paths have zero events in the filtered window, the card says **No data for selected paths** (never a 0–0 tie). Empty path chips disable.
   - Change lens, range, channel, or search: after 300ms every visible chart **and** the data view update together. Share the URL. Below 600px, chart cards stay fluid-width with no page-level horizontal scroll.

   Counselor recipe: set lens to **Students** (or **Parents**), range **30** (or **90** if you need the long hist), compare **Trade vs University**, and read the path-snapshot “so what” before the family meeting. Open **More views** only when you need mix, resilience, or weekday intensity.

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

## Production checklist

- `VITE_EVENTS_API_URL` is the API **origin only**. It ships in the browser bundle — no secrets.
- API CORS is open (`*`) this phase. Documented above; restrict when auth exists.
- `npm --prefix dashboard test && npm --prefix dashboard run build` before a static deploy. Vite copies `public/logo.png`, `public/banner-celestial.png`, and `public/favicon.png` into `dist/`.
- **Render free migrate caveat:** the API service does not run a release command on free tier. After merge, paste new files from `migrations/` in the Supabase SQL editor and `INSERT INTO schema_migrations (id) VALUES ('…') ON CONFLICT (id) DO NOTHING`, then redeploy the web service. Railway / Fly can run `npm run migrate` on release.
- Hosted dashboard (Vercel) is still later. Until then, run Vite locally against the live or local API.

# Hardcall dashboard

Local feed for career-market events, a **Charts** tab for the same telemetry, plus a **Market Insights** KPI tab. Logic lives in `src/*.ts`; chart bucketing lives in `src/charts/transforms.ts`; Chart.js lifecycle lives in `src/charts/renderCharts.ts`; presentation lives in `src/styles.css` and the markup in `index.html`.

Brand: void `#05010A`, nebula `#5B2CFF`, corona `#FFB020`, signal `#2EE6A6`, paper `#F5F2EA`.

## Run locally

```bash
cd dashboard
npm install
npm run dev
```

Open the Vite URL (default `http://127.0.0.1:5173`). The Events tab reads history from `GET {API}/api/events` and listens on `GET {API}/api/events/stream`. Charts (`?tab=charts`) use that same in-memory store. The Market Insights tab polls `GET {API}/api/insights` on mount and every **15 seconds**. KPI cards are buttons: click (or Enter / Space) opens a side drawer with that tile’s `detail` analysis. Esc or Close returns to the grid. An open drawer stays open across the 15s poll and updates in place if that id is still present.

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
| `tab` | omitted (`events`) | `events`, `charts`, or `insights` (`insight=` also opens Market Insights) |
| `page` | `1` | 1-based page |
| `perPage` | `50` | `50`, `100`, or `all` |
| `channel` | omitted | `university` · `community_college` · `trade` · `apprenticeship` · `automation` |
| `q` | omitted | search over title, description, tags (300ms debounce) |
| `insight` | omitted | insight id; opens the analysis drawer on the Market Insights tab |

Example: `/?page=2&perPage=50&channel=trade&q=welding` · `/?tab=charts` · `/?tab=insights` · `/?tab=insights&insight=<id>`

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

6. **Charts tab (reactive)** — open `?tab=charts` (or the Charts nav). You should see a 30-day activity line, a channel doughnut (University / Community College / Trade / Apprenticeship / Automation), and a bar chart per channel. Change a channel chip or type in search: after 300ms the charts recompute from **only** the matching events (same `channel` + `q` as Events). Switching back to Events keeps those filters.

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

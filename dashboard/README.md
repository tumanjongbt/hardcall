# Hardcall dashboard

Local feed for career-market events plus a **Market Insights** KPI tab. Logic lives in `src/*.ts`; presentation lives in `src/styles.css` and the markup in `index.html`.

Brand: void `#05010A`, nebula `#5B2CFF`, corona `#FFB020`, signal `#2EE6A6`, paper `#F5F2EA`.

## Run locally

```bash
cd dashboard
npm install
npm run dev
```

Open the Vite URL (default `http://127.0.0.1:5173`). The Events tab reads history from `GET {API}/api/events` and listens on `GET {API}/api/events/stream`. The Market Insights tab polls `GET {API}/api/insights` on mount and every **15 seconds**.

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
| `tab` | omitted (`events`) | `events` or `insights` |
| `page` | `1` | 1-based page |
| `perPage` | `50` | `50`, `100`, or `all` |
| `channel` | omitted | `university` · `community_college` · `trade` · `apprenticeship` · `automation` |
| `q` | omitted | search over title, description, tags (300ms debounce) |

Example: `/?page=2&perPage=50&channel=trade&q=welding` · `/?tab=insights`

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

6. **Market Insights tab** — switch to Market Insights (`?tab=insights`). KPI cards should appear (empty until `POST /api/insight`). Wait ~15s or POST a new/updated title and confirm the grid refreshes on the next poll.

```bash
curl -sS -X POST http://127.0.0.1:3000/api/insight \
  -H 'Content-Type: application/json' \
  -d '{ "title": "Top Trade Income Growth", "value": "+18%" }'
```

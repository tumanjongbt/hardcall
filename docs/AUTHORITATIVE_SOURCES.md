# Hardcall — Authoritative Data Sources (Production Gate)

**Status:** planning lock — no demo/notional data in production  
**Date:** 2026-09-21  
**Rule:** every row users see in prod must carry verifiable `source` + `source_url` + `fetched_at`. Reserved Live badges (`bls`, `onet`, `scorecard`, `apprenticeship_gov`, …) only from authenticated server-side adapters.

---

## Bernard’s requirements → primary sources

| Need | Primary (gov) | Fallback / complement | Notes |
|------|---------------|----------------------|--------|
| US colleges/universities — cost (absolute & relative) | **College Scorecard** (ED / FSA via api.data.gov) | IPEDS downloadables (NCES) | Institution + field-of-study cost/outcomes. Free API key. |
| Courses (catalog-level) | Scorecard **field of study / CIP** + program metrics | State system catalogs (case-by-case) | There is **no** single public US API for every course syllabus + sticker price. Scorecard = authoritative **program-level** cost/outcomes for Title IV schools — use that as truth for ROI, not scraped course pages. |
| Nationwide apprenticeships | **OA Partner Sponsors CSV** (powers Partner Finder) + **DOL Open Data** `ETA/apprenticeship_data` | apprenticeship.gov Active Programs stats | CSV is official, keyless, nationwide. DOL API needs Login.gov key — participation/outcomes by FY. |
| Skills, credentials, qualifications, tasks | **O\*NET Web Services v2** | O\*NET DB downloads | Free after org/project approval (~up to 3 business days). Credit + free public display required by ToS. |
| Salaries / wages | **BLS OEWS** (Public Data API v2 +/or annual tables) | CareerOneStop Occupation Details (wraps OEWS) | Register at data.bls.gov. Series IDs are fiddly; bulk XLSX often better for full SOC×geo. |
| Growing / declining fields | **BLS Employment Projections** + OOH | CareerOneStop projected employment | EP program + Projections Central for state LMI. |
| Economic context | **BLS** (employment, CPI) · **BEA** · **Census ACS** | FRED (St. Louis Fed) for series | Prefer direct gov; FRED is free with key for private-API convenience. |

---

## Source cards (verified)

### 1. College Scorecard — `source: scorecard`
- **Docs:** https://collegescorecard.ed.gov/data/api-documentation/
- **Endpoint:** `GET https://api.data.gov/ed/collegescorecard/v1/schools`
- **Auth:** api.data.gov API key (query `api_key=`)
- **Covers:** US Title IV institutions — name, location, tuition (in/out), net price, completion, earnings by field of study (CIP), debt, size, control (public/private/for-profit)
- **Freshness:** periodic ED releases (changelog active through 2026)
- **Rate limit:** default ~1000 req/IP/hour on api.data.gov
- **Attribution:** U.S. Department of Education College Scorecard
- **Does not cover:** per-section course catalogs, lab fees, housing add-ons beyond published cost-of-attendance metrics

### 2. Apprenticeship sponsors — `source: apprenticeship_gov`
- **Official CSV (Partner Finder backbone):** https://www.apprenticeship.gov/sites/default/files/wps/oa_partner_sponsors.csv  
  Verified HTTP 200, ~6.8 MB, last-modified mid-Sep 2026.
- **Help / Partner Finder:** https://www.apprenticeship.gov/partner-finder/partner-finder-guide
- **Auth:** none for CSV
- **Covers:** registered program sponsors nationwide (employers, JATCs, colleges, workforce boards)
- **Complement — DOL Open Data:** https://dataportal.dol.gov/datasets/10264  
  `https://apiprod.dol.gov/v4/get/ETA/apprenticeship_data/json?X-API-KEY=…`  
  Lifecycle / demographic / state FY stats (not a full program directory by itself)
- **Does not cover:** every open job posting (Job Finder uses NLx separately)

### 3. O\*NET Web Services — `source: onet`
- **Docs:** https://services.onetcenter.org/reference/
- **Signup:** https://services.onetcenter.org/developer/signup
- **Auth:** `X-API-Key` header only (no query string). Org + project review (up to ~3 business days).
- **Covers:** occupations, skills, knowledge, abilities, tasks, tools/tech, education, related occupations, bright outlook
- **ToS:** free publicly accessible display + credit/link to O\*NET Web Services required
- **Already reserved** in Hardcall integrity CHECK — adapters only

### 4. BLS Public Data API / OEWS — `source: bls`
- **API docs:** https://www.bls.gov/developers/api_signature_v2.htm
- **Register key:** https://data.bls.gov/registrationEngine/
- **OEWS tables:** https://www.bls.gov/oes/tables.htm (May 2025+ XLSX)
- **Covers:** occupational wages national/state/metro; employment levels
- **Rate limit (v2 registered):** ~500 req/day, ≤50 series/request — prefer bulk tables for national refresh
- **Already reserved** in Hardcall integrity CHECK — adapters only

### 5. BLS Employment Projections / OOH — `source: bls_ep` (or `bls` with series subtype)
- **OOH developer / republish:** https://www.bls.gov/ooh/about/ooh-developer-info.htm
- **Covers:** 10-year growth/decline, typical education/training/experience
- **CareerOneStop** (optional aggregator): https://www.careeronestop.org/Developers/WebAPI/Occupation/get-occupation-details.aspx — token required; wraps O\*NET + OEWS + EP

### 6. Economic backdrop — `source: bea` / `census` / `fred` (phase C)
- BEA API, Census ACS API, FRED API — contextual macro only; not career ROI core

---

## Honest gaps (do not fake)

1. **Per-course university catalogs** — no national public API. Production truth = Scorecard **program/CIP + cost of attendance**, not invented course rows. If Bernard later needs syllabus-level detail, that is a separate licensed/partner feed or school-by-school agreement — not scraping.
2. **Live BLS “every minute”** — OEWS/EP are survey/projection releases, not tick streams. Hardcall “live” means **fresh fetched_at from authoritative releases**, not fake realtime.
3. **Private aggregators** — only after gov gaps; disclose ToS/cost; never replace Scorecard/BLS/O\*NET as source of truth.

---

## Architecture (fits current Hardcall)

```
[Cron worker on Render] → adapters (scorecard|apprenticeship|bls|onet)
        ↓
  normalize → provenance {source, source_url, fetched_at}
        ↓
  internal ingest (auth’d) → Postgres (events / insights / future domain tables)
        ↓
  public REST + SSE → dashboard (Demo badges OFF in prod; Live only from reserved sources)
```

- **Keys stay on Render** (`SCORECARD_API_KEY`, `BLS_API_KEY`, `ONET_API_KEY`, `DOL_API_KEY`). Never in Vite/dashboard.
- **Public POST** keeps rejecting reserved sources (already shipped).
- **Prod gate env:** `HARDCALL_ALLOW_DEMO=false` → Admin seed + Playground write + synthetic CLI disabled or 403.

### Suggested domain tables (Protostar later)
- `institutions` / `programs` (Scorecard UNITID + CIP)
- `apprenticeship_sponsors` / `apprenticeship_programs`
- `occupations` (SOC/O\*NET) / `wage_observations` / `projections`
- Keep `events` as the human-facing signal feed derived from those tables (not the warehouse itself)

---

## Phased plan

### Phase A — Trust spine (ship first)
1. Register keys: api.data.gov (Scorecard), BLS, O\*NET project, DOL dataportal.
2. Server-only adapters: Scorecard institutions+programs (sample states → all US), Apprenticeship CSV nightly, OEWS national wages (bulk), O\*NET occupation search/detail.
3. Provenance on every write; Insights recompute from live tables only.
4. `HARDCALL_ALLOW_DEMO=false` on Render production; strip seed from prod UI or hide Admin seed.

**Exit:** dashboard shows only Live·Scorecard / Live·Apprenticeship / Live·BLS / Live·O\*NET rows; click-through `source_url` works.

### Phase B — Coverage
- Full Scorecard field-of-study ingest; state OEWS; Employment Projections growth tags on Insights; apprenticeship sponsor → occupation join via SOC where possible.

### Phase C — Host / harden
- Render: web + **worker** (cron) services; Supabase backups; rate-limit + retry; Supernova: ingest auth + key rotation; observability (fetch success, lag vs release date).
- Legal: attribution footers; O\*NET credit; Scorecard/BLS citation; privacy (no PII from RAPIDS — we only use public sponsor extract).

---

## Production deploy checklist (do not flip prod until)

- [ ] All four Phase A adapters green in staging against real keys
- [ ] Zero `source=synthetic|playground|cli|demo` rows in prod DB (or archived out of public queries)
- [ ] Reserved-source spoof still 400 on public POST
- [ ] Attribution + “data as of {fetched_at}” visible in UI
- [ ] Keys only in Render env; dashboard build has no secrets
- [ ] Bernard legal/ethics sign-off: program-level costs (Scorecard), not fabricated course prices

---

## Keys Bernard should request (human steps)

1. **api.data.gov** — College Scorecard  
2. **data.bls.gov** registration — BLS API v2  
3. **O\*NET Web Services** — org + Hardcall project signup  
4. **DOL dataportal** — Login.gov → API key (apprenticeship_data)  
5. Optional later: CareerOneStop token, FRED, BEA, Census

---

## Discord one-liner (honest)

Hardcall production will only ship career ROI signals pulled from U.S. College Scorecard, DOL registered apprenticeship data, BLS wages/projections, and O\*NET — with clickable provenance. Demo seed stays off prod.

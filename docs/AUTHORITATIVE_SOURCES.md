# Hardcall Authoritative Data-Source Map

**App:** Hardcall — career ROI for students, parents, counselors, workforce  
**Tagline:** the call that shapes your orbit  
**Repo:** `tumanjongbt/hardcall`  
**Scope:** US-only production ingest (no notional/demo data in prod)  
**Report date:** 2026-09-21 (America/New_York)  
**Status:** Canonical research map. **Phase A keyless bulk is implemented** (`scorecard` institution+FoS zips, `bls` OEWS tables, `onet` database CSV) plus the keyless `apprenticeship_gov` partner CSV (Phase B in the matrix; shipped because it needs no key). Reserved enums include Phase B/C sources (`ipeds`, `careeronestop`, `census`, `bea`, `fred`) so public POST cannot spoof them. **No CareerOneStop / IPEDS / Census / BEA / FRED adapters yet.** CareerOneStop must never store Bing geocodes.

**8pm production path:** `HARDCALL_ALLOW_DEMO=false`, paste `006` + `007` on Supabase, run `npm run ingest -- --source all`. API keys are optional later — Phase A does not wait on api.data.gov / BLS / O\*NET Web Services accounts.

---

## 0. Non-negotiables (Bernard)

1. **No notional/demo/seed data in production.** Users must verify veracity for life-changing career choices.
2. Pull real US data for:
   1. Courses + absolute/relative costs from real US universities/colleges **only**
   2. Apprenticeship programs nationwide (US)
   3. Career skills, credentials, qualifications, salaries, years of experience
   4. Growing/declining career fields
   5. Economic context from current government/public (prefer) / reputable private APIs
3. Provenance on every stored fact: `source`, `source_url`, `fetched_at` (already in Hardcall contracts).
4. Anonymous `POST /api/events` **must not** mint reserved live sources (`bls`, `onet` today; extend reservation to all gov adapters below).

---

## 1. Hardcall ingest fit (current repo)

| Piece | Current state | Prod implication |
|-------|---------------|------------------|
| Events | `POST /api/events` + SSE `GET /api/events/stream` | Adapters write events with provenance |
| Insights | `POST /api/insight`, `GET /api/insights` | Salary/growth KPIs as insights |
| `EventSource` enum | `synthetic`, `manual`, `playground`, `cli`, `bls`, `onet`, `unknown` | **Extend** with new enum values below before adapters ship |
| Reserved (anon POST blocked) | `bls`, `onet` | Extend reservation to **all** production sources |
| Channels | `university`, `community_college`, `trade`, `apprenticeship`, `automation` | Map adapters → channel |
| Auth for live sources | Not yet (contracts say “Supernova”) | Worker/cron uses service credential; never dashboard |

**Suggested `source` enum additions** (DB + `events_validate.js` + `types.ts`):

| Enum | Authority |
|------|-----------|
| `bls` | BLS OEWS + Employment Projections *(already reserved)* |
| `onet` | O\*NET Web Services *(already reserved)* |
| `scorecard` | College Scorecard (ED/FSA via api.data.gov) |
| `ipeds` | NCES IPEDS bulk files |
| `apprenticeship_gov` | Apprenticeship.gov partner CSV + DOL RAPIDS open data |
| `careeronestop` | CareerOneStop / ETA Web APIs |
| `census` | Census ACS (+ optional PSEO/LEHD) |
| `bea` | Bureau of Economic Analysis API |
| `fred` | St. Louis Fed FRED API *(optional macro context)* |

Keep `synthetic` / `playground` / `cli` for **non-prod only**. Prod gate: those sources rejected or endpoints disabled when `NODE_ENV=production` / `HARDCALL_ALLOW_DEMO=false`.

---

## 2. Requirement → source matrix

| # | Bernard requirement | Primary source(s) | Fallback | Gaps / honesty notes |
|---|---------------------|-------------------|----------|----------------------|
| 1 | Courses + absolute/relative costs (US colleges only) | **College Scorecard** (institution cost of attendance, in/out-state tuition; field-of-study debt/earnings by CIP) | **IPEDS** (tuition/fees, CIP completions, institutional characteristics) | **No national public API for per-course catalogs + sticker price.** Scorecard/IPEDS give institution- and program-(CIP)-level costs/outcomes, not “CS 101 = $X”. Relative cost = compare institutions/programs. |
| 2 | Apprenticeship programs nationwide | **Apprenticeship.gov partner sponsors CSV** + **DOL Open Data `ETA/apprenticeship_data`** | CareerOneStop apprenticeship offices API; O\*NET RAPIDS crosswalk | Partner CSV = sponsor/org directory (not full RAPIDS program curriculum). Apprentice lifecycle stats ≠ every active program listing. |
| 3 | Skills, credentials, qualifications, salaries, YoE | **O\*NET** (skills, knowledge, education/job zones, tech skills) + **BLS OEWS** (wages) + **CareerOneStop** (licenses, certifications, wages by location) | Scorecard earnings by field; Census PSEO earnings by institution/major | “Years of experience” is rarely a clean numeric field — use O\*NET Job Zones / education/experience typical pathways, not invented YoE. |
| 4 | Growing / declining fields | **BLS Employment Projections** (10-yr employment change, openings) | O\*NET Bright Outlook; CareerOneStop outlook slices | EP is annual national/SOC matrix — not real-time job postings. |
| 5 | Economic context (gov/public APIs) | **Census ACS** + **BEA** | **FRED** (private Fed but public API) | Macro/regional context only — not career ROI core. Prefer gov first. |

---

## 3. Candidate sources (verified)

> URL verification notes (2026-09-21 ET): Scorecard, IPEDS portal, O\*NET, DOL portal, Census, BEA, CareerOneStop docs, Apprenticeship.gov CSV returned **HTTP 200** from research host. **BLS** and **FRED** documentation hosts returned bot/edge blocks (403/timeout) from this environment; URLs below are the **official documented** endpoints from BLS/Fed developer materials and widely cited gov docs — treat as authoritative portals, re-check live in your browser/Render egress before coding.

---

### 3.1 College Scorecard (ED / Federal Student Aid)

| Field | Detail |
|-------|--------|
| **Official name** | College Scorecard API / Data |
| **Type** | US government (Department of Education) |
| **Docs / portal** | https://collegescorecard.ed.gov/data/api-documentation/ |
| **API overview** | https://collegescorecard.ed.gov/data/api/ |
| **Data downloads** | https://collegescorecard.ed.gov/data/ (updated **2026-06-10** per site) |
| **Data dictionary** | https://collegescorecard.ed.gov/assets/CollegeScorecardDataDictionary.xlsx |
| **Institution tech docs** | https://collegescorecard.ed.gov/assets/InstitutionDataDocumentation.pdf |
| **Field-of-study tech docs** | https://collegescorecard.ed.gov/assets/FieldOfStudyDataDocumentation.pdf |
| **Verified base URL** | `https://api.data.gov/ed/collegescorecard/v1/schools` |
| **Key signup** | https://api.data.gov/signup/ (free api.data.gov key) |
| **Auth** | Query param `api_key=…` on every request |
| **Hardcall covers** | Req 1 (costs, institutions, CIP/program outcomes); partial Req 3 (earnings) |
| **Key fields** | `school.*`, `latest.cost.tuition.in_state`, `latest.cost.tuition.out_of_state`, `latest.cost.attendance.*`, completion/debt/earnings; nested **field of study** by CIP + credential (debt, earnings) — **not** per-course prices |
| **Update cadence** | Periodic ED releases (multiple updates/year; site flagged June 2026 IPEDS/FSA refresh) |
| **Rate limits** | **1,000 requests / IP / hour** (default); increase via scorecarddata@rti.org |
| **License / attribution** | US gov public data; cite College Scorecard / Dept. of Education; follow api.data.gov terms |
| **Gaps** | No course catalog; tuition is institution-level (and FoS outcomes ≠ sticker program tuition); Title IV universe only; privacy suppression → nulls |
| **Suggested `source`** | `scorecard` |
| **`source_url` example** | `https://collegescorecard.ed.gov/school/?{id}` or API request URL used |

---

### 3.2 IPEDS / NCES

| Field | Detail |
|-------|--------|
| **Official name** | Integrated Postsecondary Education Data System (IPEDS) |
| **Type** | US government (NCES / ED) |
| **Portal** | https://nces.ed.gov/ipeds/use-the-data |
| **Complete data files help** | https://nces.ed.gov/ipeds/help/complete-data-files |
| **Access databases** | https://nces.ed.gov/ipeds/use-the-data/download-access-database |
| **REST API?** | **No general public REST API for survey microdata.** Primary path = CSV / Access DB downloads. (ArcGIS map service exists for geography — not a substitute for cost/CIP tables.) |
| **Auth** | None for public downloads |
| **Hardcall covers** | Req 1 fallback (tuition/fees, CIP completions, institutional characteristics, enrollments) |
| **Update cadence** | Annual collection; provisional then final releases (e.g. 2024–25 provisional noted Mar 2026 on Access DB page) |
| **Rate limits** | N/A (bulk download); respect fair use / don’t scrape the UI aggressively |
| **License** | US gov public data; cite NCES/IPEDS |
| **Gaps** | Batch-oriented (not live API); steeper ETL; still **not** per-course catalogs |
| **Suggested `source`** | `ipeds` |
| **Practical use** | Nightly/weekly worker downloads Complete Data Files → normalize UNITID ↔ Scorecard OPEID crosswalk |

---

### 3.3 Apprenticeship.gov + DOL RAPIDS open data

#### A) Partner / sponsor directory (programs-adjacent)

| Field | Detail |
|-------|--------|
| **Official name** | Apprenticeship.gov Office of Apprenticeship partner sponsors file |
| **Type** | US government (DOL / OA) |
| **Verified download** | https://www.apprenticeship.gov/sites/default/files/wps/oa_partner_sponsors.csv (**HTTP 200**, ~6.8 MB; Last-Modified ~2026-09-16) |
| **Dashboards** | https://www.apprenticeship.gov/data-and-statistics/active-programs · https://www.apprenticeship.gov/data-and-statistics/apprentices-by-state-dashboard |
| **Auth** | None (public CSV) |
| **Observed columns** | `ORGANIZATION NAME`, `ORGANIZATION TYPE`, `ORGANIZATION URL`, `ADDRESS`, `CITY`, `STATE`, `ZIP`, `COUNTY`, `CONTACT PERSON`, `EMAIL`, `PHONE`, `REGISTERED DATE` |
| **Hardcall covers** | Req 2 (nationwide sponsor/org list for registered apprenticeship ecosystem) |
| **Cadence** | File refreshed periodically (treat as “fetch weekly”; check `Last-Modified`) |
| **Gaps** | Sponsor directory ≠ full program occupation list, wages, or openings; sparse TYPE/URL on some rows |
| **Suggested `source`** | `apprenticeship_gov` |
| **`source_url`** | The CSV URL above (or Apprenticeship.gov partner finder page if linking humans) |

#### B) DOL Open Data API — apprenticeship participation (RAPIDS-derived)

| Field | Detail |
|-------|--------|
| **Official name** | DOL Open Data Portal — ETA `apprenticeship_data` |
| **Type** | US government (DOL) |
| **User guide** | https://data.dol.gov/user-guide |
| **Registration** | https://dataportal.dol.gov/registration |
| **Dataset catalog page** | https://dataportal.dol.gov/datasets/10264 |
| **Datasets API (no key)** | `https://apiprod.dol.gov/v4/datasets` |
| **Verified data pattern** | `https://apiprod.dol.gov/v4/get/ETA/apprenticeship_data/json?X-API-KEY=…&limit=…&offset=…` |
| **Metadata pattern** | `https://apiprod.dol.gov/v4/get/ETA/apprenticeship_data/json/metadata?X-API-KEY=…` |
| **Auth** | Free API key after registration/questionnaire; **do not share keys publicly** (DOL ToS) |
| **Pagination** | Up to **10,000 records or 5 MB per request**; use `limit` + `offset` |
| **Hardcall covers** | Req 2 (participation, occupation, industry, geography, wage fields in lifecycle data) |
| **Cadence** | “Live and updated” per DOL guide; dashboards cited data through early Sep 2026 |
| **Gaps** | Statistical/participation dataset — not a polished “find a program near me” product API; PII stripped; SAA/historical nuance documented on Apprenticeship.gov |
| **Suggested `source`** | `apprenticeship_gov` (same family; distinguish via `source_url` / tags) |

---

### 3.4 BLS — OEWS (wages) + Employment Projections (growth/decline)

| Field | Detail |
|-------|--------|
| **Official name** | Bureau of Labor Statistics Public Data API; OEWS; Employment Projections (EP) |
| **Type** | US government (DOL/BLS) |
| **Developer home** | https://www.bls.gov/developers/home.htm |
| **API v2 signatures** | https://www.bls.gov/developers/api_signature_v2.htm |
| **API FAQs / limits** | https://www.bls.gov/developers/api_faqs.htm |
| **Registration** | https://data.bls.gov/registrationEngine/ (**verified 200**) |
| **API endpoint** | `https://api.bls.gov/publicAPI/v2/timeseries/data/` (POST JSON) |
| **OEWS program** | https://www.bls.gov/oes/ |
| **OEWS time-series files** | https://download.bls.gov/pub/time.series/oe/ |
| **EP occupational data** | https://www.bls.gov/emp/data/occupational-data.htm |
| **EP tables** | https://www.bls.gov/emp/tables.htm |
| **Auth** | Optional registration key for v2 higher limits; **renew yearly** |
| **Rate limits (documented)** | **Registered:** 500 queries/day, 50 series/query, 20 years/query, 50 req / 10s. **Unregistered:** 25 / day, 25 series, 10 years. |
| **Hardcall covers** | Req 3 (salaries/wages), Req 4 (projected employment change / openings) |
| **Cadence** | OEWS ~annual (typically spring); EP ~annual 10-year horizon (current releases cover 2024–2034 vintage on BLS) |
| **License** | US gov; cite BLS; respect BLS automated-access policy (no abusive bots on HTML) |
| **Gaps** | Series ID construction is non-trivial; OEWS via API often latest year-oriented — prefer bulk OEWS files for national SOC tables; EP best as **XLSX/CSV download**, not a dedicated EP REST resource |
| **Suggested `source`** | `bls` |
| **`source_url`** | Specific BLS table or series documentation URL |

---

### 3.5 O\*NET Web Services

| Field | Detail |
|-------|--------|
| **Official name** | O\*NET Web Services API v2 |
| **Type** | US government-sponsored (USDOL/ETA; National Center for O\*NET Development) |
| **Reference manual** | https://services.onetcenter.org/reference/ |
| **Account management** | https://services.onetcenter.org/reference/start/accounts |
| **Data license** | https://services.onetcenter.org/help/license_data |
| **Database download alt** | https://www.onetcenter.org/database.html (CC BY 4.0 for DB files) |
| **Auth** | Free developer account; org approval (up to **~3 business days**); `X-API-Key` **header only** (GET only) |
| **Current DB (per docs)** | O\*NET **31.0** (kept current as releases land) |
| **Hardcall covers** | Req 3 (skills, knowledge, abilities, technology skills, education, job zones, apprenticeship notes); partial Req 4 (Bright Outlook) |
| **Rate limits** | No hard published max; **429** possible; retry after ≥200 ms; batch guidance in Terms of Service; cache aggressively (quarterly/annual data) |
| **License / attribution** | Free commercial use; **must acknowledge O\*NET Web Services**, link site, register app URL, present data **without alteration**; trademark rules for “O\*NET®” |
| **Gaps** | Not a wage authority (use BLS); external-source snippets in responses may have separate restrictions; personal unaffiliated use of Web Services not supported (use OnLine/DB instead) |
| **Suggested `source`** | `onet` |
| **Useful paths (from OpenAPI TOC)** | `/online/occupations/{code}/summary/skills`, `…/education`, `…/job_zone`, `/mnm/bright_outlook/`, `/online/crosswalks/RAPIDS` |

---

### 3.6 CareerOneStop (ETA / DEED)

| Field | Detail |
|-------|--------|
| **Official name** | CareerOneStop Web APIs |
| **Type** | US government-sponsored (DOL/ETA; operated with Minnesota DEED) |
| **Web API hub** | https://www.careeronestop.org/Developers/WebAPI/web-api.aspx |
| **Registration** | https://www.careeronestop.org/Developers/WebAPI/registration.aspx (**verified 200**) |
| **API Explorer** | https://api.careeronestop.org/api-explorer/ |
| **Base URL** | `https://api.careeronestop.org` |
| **Auth** | UserID + Bearer **API Token** (`Authorization: Bearer …`) after click-through license |
| **License highlights** | Royalty-free; **expires 36 months** from application; **attribution required** on each page to DOLETA **and** DEED; non-transferable; purpose-limited; **HARD BAN: never store or share Bing geocodes** (Microsoft Bing ToS — CareerOneStop license). Persist only occupation/license/wage fields Hardcall needs; drop any geocode payload at the adapter boundary. |
| **Verified endpoints** | Salaries: `GET /v1/comparesalaries/{userId}/wage?keyword=&location=` · Licenses: `GET /v1/license/{userId}/{keyword}/{location}/…` · Certifications / occupations / apprenticeship **offices** also documented under Developers |
| **Hardcall covers** | Req 3 (licenses, certifications, local wages); Req 2 assist (apprenticeship **offices**, not full RAPIDS programs) |
| **Cadence** | License data: states revise ~every 2 years; COS refreshes ~every 4–6 months as received |
| **Rate limits** | Not clearly published on public pages reviewed — implement conservative throttling + caching; contact webservices@careeronestop.org |
| **Gaps** | Jobs API v1/v2 enrollment caveats for newer users; not a substitute for BLS/O\*NET authority on national SOC definitions |
| **Suggested `source`** | `careeronestop` |

---

### 3.7 Census Bureau (ACS) + optional PSEO

| Field | Detail |
|-------|--------|
| **Official name** | Census Data API — American Community Survey |
| **Type** | US government |
| **Datasets index** | https://www.census.gov/data/developers/data-sets.html |
| **ACS 5-year** | https://www.census.gov/data/developers/data-sets/acs-5year.html |
| **Key signup** | https://api.census.gov/data/key_signup.html (**verified 200**) |
| **Pattern** | `https://api.census.gov/data/{year}/acs/acs5?get=NAME,…&for=state:*&key=…` |
| **Auth** | Free API key **required for data queries** (as of 2026 Census guidance) |
| **Hardcall covers** | Req 5 (income, employment, industry, education attainment by geo) |
| **Bonus ROI** | **PSEO** (Post-Secondary Employment Outcomes) via LEHD: https://lehd.ces.census.gov/data/pseo_experimental.html — earnings/employment by institution & major (**verified 200**) |
| **Cadence** | ACS 1-year / 5-year annual release cycle |
| **Gaps** | Context, not occupation wages (use OEWS); PSEO is experimental/limited institution coverage |
| **Suggested `source`** | `census` |

---

### 3.8 BEA (Bureau of Economic Analysis)

| Field | Detail |
|-------|--------|
| **Official name** | BEA Data Application Programming Interface |
| **Type** | US government (Commerce/BEA) |
| **Docs** | https://apps.bea.gov/API/docs/index.htm |
| **Signup** | https://apps.bea.gov/API/signup/index.html (**verified 200**) |
| **ToS PDF** | https://apps.bea.gov/API/_pdf/bea_api_tos.pdf |
| **User guide PDF** | https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf |
| **Endpoint pattern** | `https://apps.bea.gov/api/data/?UserID=…&method=GETDATASETLIST&ResultFormat=JSON` |
| **Auth** | Free 36-char UserID emailed after signup + activation |
| **Rate limits (documented)** | **100 requests/min**, **100 MB/min**, or **30 errors/min** → HTTP **429** + `Retry-After` |
| **Hardcall covers** | Req 5 (GDP, income, regional economic accounts) |
| **Suggested `source`** | `bea` |

---

### 3.9 FRED (St. Louis Fed) — optional private/public gap-filler

| Field | Detail |
|-------|--------|
| **Official name** | FRED® API (Federal Reserve Economic Data) |
| **Type** | **Public sector / central bank** (not private commercial SaaS) — still **not** ED/DOL/Census; use only for macro series after gov gaps |
| **API docs** | https://fred.stlouisfed.org/docs/api/fred/ |
| **API key** | https://fred.stlouisfed.org/docs/api/api_key.html |
| **Auth** | Free API key via FRED account |
| **Hardcall covers** | Req 5 supplemental (unemployment, CPI, etc.) |
| **Rate / ToS** | Fed may impose bandwidth/transaction limits; **429** on excess; community often cites ~120 req/min — **confirm in ToS**, don’t hard-code unverified quotas |
| **Suggested `source`** | `fred` |
| **Note** | Research host could not HTTP-verify FRED docs (egress/timeout); confirm in browser before Phase C |

---

### 3.10 Course catalogs — reality check (Req 1)

| Approach | Ready? | Notes |
|----------|--------|-------|
| **Scorecard cost of attendance + FoS CIP outcomes** | **Yes — primary** | Absolute/relative **institution & program** economics users can verify on collegescorecard.ed.gov |
| **IPEDS tuition/fees + CIP completions** | **Yes — fallback/enrichment** | Bulk ETL |
| **Census PSEO** | **Partial** | Institution × major earnings — ROI side, not sticker price |
| **State system open data** (e.g. some public university systems) | **Opportunistic** | No unified national standard; evaluate per-state if Bernard prioritizes depth |
| **University public course APIs** | **Rare** | Few schools expose unified course+price APIs |
| **Scraping catalogs** | **Last resort** | Legal/ToS/ethics risk; brittle HTML; rate limits; may violate CFAA/ToS; **do not** ship as default prod strategy. If ever pursued: written permission, robots.txt, crawl budget, counsel review |

**Product copy recommendation:** Label costs as **“institution / program cost of attendance (College Scorecard)”** — never imply per-section course sticker unless a licensed feed exists.

---

## 4. Private commercial APIs

**Prefer government first.** Only evaluate private APIs if a gov gap blocks ship:

| Vendor class | Example use | Flags |
|--------------|-------------|-------|
| Job posting / skills graphs | Lightcast, The Muse, Indeed publisher | Cost, ToS, redistribution limits, bias |
| College net-price calculators | Aggregators | Often scrape-derived; license unclear |
| Credential libraries | Commercial cert DBs | Prefer CareerOneStop Certifications first |

**Hardcall stance:** Phase A–B = **gov only**. Phase C may add one paid feed **only** with ToS reviewed and UI disclosure.

---

## 5. Phased adapter plan (plugs into events + insights + provenance)

### Phase A — Foundation (unlock prod trust)

**Goal:** Real wages, skills, growth, college costs — no demo leakage.

| Adapter | Writes | Channel(s) | Cadence |
|---------|--------|------------|---------|
| `scorecard` | Events: institution/program cost & outcome cards; Insights: median debt/earnings KPIs | `university`, `community_college` | Weekly full sync + daily delta if API supports |
| `bls` OEWS | Insights: median wage by SOC (+ metro when ready); Events: notable wage releases | `trade`, `automation`, `university` | After annual OEWS publish; monthly check |
| `bls` EP | Insights: fastest growing/declining SOC; Events: “field outlook” | all career channels | Annual + on new EP release |
| `onet` | Events/insights: skills, job zone, education, Bright Outlook | all | Quarterly (match O\*NET DB) |

**Enum work:** Add `scorecard` to DB CHECK / validators; keep `bls`/`onet` reserved; **also reserve** `scorecard`.

**Auth path:** Internal worker only (`HARDCALL_INGEST_TOKEN` or Supabase service role) — never anonymous POST.

### Phase B — Pathways (apprenticeships + credentials)

| Adapter | Writes | Channel | Cadence |
|---------|--------|---------|---------|
| `apprenticeship_gov` CSV | Events: sponsor/org presence by state | `apprenticeship` | Weekly |
| DOL `apprenticeship_data` | Insights: completion/active counts by occupation/state; Events: notable trends | `apprenticeship` | Weekly/monthly |
| `careeronestop` licenses + certifications | Events: “license required in STATE”; Insights: credential lists | `trade`, `apprenticeship`, `university` | Monthly |
| `ipeds` bulk | Enrich Scorecard UNITID gaps (control, CIP completions) | `university`, `community_college` | After NCES provisional/final |

### Phase C — Economic context + optional FRED

| Adapter | Writes | Cadence |
|---------|--------|---------|
| `census` ACS | Metro/state income & industry context insights | After ACS releases |
| `census` PSEO (optional) | Institution major earnings complementary to Scorecard | Per PSEO release |
| `bea` | Regional GDP/income context | Monthly/quarterly series |
| `fred` (optional) | Macro series for dashboards | Daily/weekly |

---

## 6. Hard production gate (demo/seed unreachable)

**Not ready for prod until all boxes are checked:**

- [ ] `NODE_ENV=production` **or** `HARDCALL_ALLOW_DEMO=false` disables:
  - [ ] Seed scripts / playground mint routes
  - [ ] Acceptance of `source ∈ {synthetic, playground}` on any write path
  - [ ] Dashboard “generate sample” controls (if any)
- [ ] Anonymous `POST /api/events` rejects **all** live enums: `bls`, `onet`, `scorecard`, `ipeds`, `apprenticeship_gov`, `careeronestop`, `census`, `bea`, `fred` (`rule: reserved`)
- [ ] Only authenticated **ingest worker** can insert reserved sources
- [ ] DB constraint / CHECK aligns with app validators
- [ ] Every prod row has non-null `source` ∈ live set, `source_url` (https), `fetched_at` (UTC ISO)
- [ ] UI shows provenance (“Source: College Scorecard · fetched …”) with outbound link
- [ ] Attribution footers for O\*NET and CareerOneStop (DEED + DOLETA) where those data appear
- [ ] No scraping adapters enabled by default
- [ ] Secrets only on Render/Supabase server env — **never** `VITE_*` / dashboard bundle
- [ ] Smoke test: empty DB → worker run → events/insights non-empty **and** zero `synthetic`/`playground` rows
- [ ] Rate-limit backoff + idempotent upserts (dedupe key: source + external_id + vintage)

---

## 7. Deploy path — Render + Supabase

### Secrets (Render API service / worker only)

| Env var | Purpose |
|---------|---------|
| `DATABASE_URL` / Supabase pooler | Postgres |
| `HARDCALL_INGEST_TOKEN` | Worker → API auth for reserved sources |
| `SCORECARD_API_KEY` | api.data.gov |
| `BLS_API_KEY` | BLS registration key |
| `ONET_API_KEY` | O\*NET `X-API-Key` |
| `DOL_API_KEY` | dataportal.dol.gov |
| `CAREERONESTOP_USER_ID` / `CAREERONESTOP_API_TOKEN` | COS Bearer |
| `CENSUS_API_KEY` | Census |
| `BEA_API_KEY` | BEA UserID |
| `FRED_API_KEY` | optional |
| `HARDCALL_ALLOW_DEMO` | must be `false` in prod |

**Never** expose the above to Vite (`dashboard`). Dashboard talks only to Hardcall public GET APIs.

### Scheduling

| Option | Use |
|--------|-----|
| Render **Cron Job** service | `node dist/workers/fetch_scorecard.js` etc. |
| Supabase `pg_cron` + Edge Function | Only if secrets stay server-side |
| Single `ingest-worker` Docker | Preferred: one process, queue of adapters, shared backoff |

### Operational notes

- Store raw payloads in an `ingest_raw` table (optional) for audit — users trust veracity.
- Version external vintages (`release_id`, `data_year`) in tags or JSON detail.
- Renew: BLS key annually; CareerOneStop every 36 months; O\*NET org/project URL registration.

---

## 8. Suggested event / insight shapes (non-normative)

```json
{
  "channel": "university",
  "title": "In-state tuition & COA — Example State University",
  "description": "Scorecard latest.cost … (human summary).",
  "tags": ["college_students", "parents"],
  "source": "scorecard",
  "source_url": "https://collegescorecard.ed.gov/school/?123456",
  "fetched_at": "2026-09-21T07:00:00.000Z"
}
```

```json
{
  "title": "Median annual wage — Software Developers (SOC 15-1252)",
  "value": "$132,270",
  "detail": "OEWS national estimate; vintage …",
  "source": "bls"
}
```

*(Insight contract today has limited `source` enum — extend `InsightSource` in lockstep with events.)*

---

## 9. Key signup checklist (blockers)

| Key / access | URL | Blocker? |
|--------------|-----|----------|
| api.data.gov (Scorecard) | https://api.data.gov/signup/ | **Required for Phase A** |
| BLS API registration | https://data.bls.gov/registrationEngine/ | **Required for Phase A** (higher limits) |
| O\*NET Web Services org approval | https://services.onetcenter.org/ (Sign Up) | **Required for Phase A** (≤3 business days) |
| DOL Open Data key | https://dataportal.dol.gov/registration | Required Phase B |
| CareerOneStop registration | https://www.careeronestop.org/Developers/WebAPI/registration.aspx | Required Phase B (36‑mo license) |
| Census API key | https://api.census.gov/data/key_signup.html | Required Phase C |
| BEA UserID | https://apps.bea.gov/API/signup/index.html | Required Phase C |
| FRED API key | https://fred.stlouisfed.org/docs/api/api_key.html | Optional Phase C |
| Per-course price national API | — | **Does not exist** — product must scope to Scorecard/IPEDS |

---

## 10. Explicit “not ready for prod until X”

1. Live API keys registered and stored on Render (not in git / not in dashboard).
2. Source enum + DB constraints extended; reserved-source enforcement for **all** live sources.
3. Demo/seed/playground write paths **hard-disabled** in production env.
4. Phase A adapters (`scorecard`, `bls`, `onet`) shipping non-empty, provenance-complete data.
5. UI provenance + required attributions (O\*NET; CareerOneStop when used).
6. Worker schedule + monitoring (failed fetch alerts).
7. Legal/product acceptance of **no per-course national price feed** (Scorecard/IPEDS framing).
8. Counsel/product sign-off that scraping is out of scope for v1.

---

## 11. Research method

- Official portals fetched via WebFetch / curl where hosts allowed.
- Hardcall `src/types.ts`, `src/events_validate.js`, and `contracts/POST_api_events.md` reviewed for existing provenance/`bls`/`onet` reservation.
- Apprenticeship partner CSV schema inspected from live download.
- No invented endpoints: only URLs from official docs or HTTP-verified public files.

---

*End of authoritative source map.*

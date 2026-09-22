import assert from "node:assert/strict";
import { test } from "node:test";
import type { InsightRow } from "./types";
import {
  buildFeedStrip,
  channelMix,
  costEarningsSeries,
  decisionTiles,
  emptyWarehouse,
  loadWarehouse,
  occupationChannel,
  parseEcon,
  parseInstitutions,
  parsePrograms,
  projectionSeries,
  scorecardChannel,
  tilesForLens,
  visibleApiInsights,
  wageDistribution,
} from "./warehouse";

test("scorecard channel uses credential level or name and does not guess", () => {
  assert.equal(scorecardChannel({ credential_level: "2", credential_title: "Associate's Degree" }), "community_college");
  assert.equal(scorecardChannel({ credential_level: "3", credential_title: "Bachelor's Degree" }), "university");
  assert.equal(scorecardChannel({ name: "City College of San Francisco" }), null);
  assert.equal(scorecardChannel({ name: "Austin Community College" }), "community_college");
  assert.equal(occupationChannel(-4.2), "automation");
  assert.equal(occupationChannel(3), "trade");
  assert.equal(occupationChannel(null), "trade");
});

test("institution and program parsers keep numeric strings and skip rows missing both cost fields later", () => {
  const institutions = parseInstitutions({
    institutions: [
      {
        unitid: "1",
        name: "Example State University",
        state: "CA",
        net_price: "12000",
        tuition_in_state: "8000",
        median_earnings: "45000",
        source: "scorecard",
        source_url: "https://collegescorecard.ed.gov/school/?1",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(institutions[0]?.net_price, 12000);
  assert.equal(institutions[0]?.source, "scorecard");
  const programs = parsePrograms({
    programs: [
      {
        unitid: "1",
        cip_code: "11.07",
        cip_title: "Computer Science",
        credential_level: "3",
        credential_title: "Bachelor's Degree",
        median_debt: "20000",
        median_earnings: "70000",
        source_url: "https://collegescorecard.ed.gov/data/",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
      {
        unitid: "2",
        cip_code: "48.05",
        cip_title: "Welding",
        credential_level: "1",
        median_earnings: "40000",
      },
    ],
  });
  assert.equal(programs.length, 2);
  assert.equal(programs[1]?.median_debt, null);
  const series = costEarningsSeries(
    { ...emptyWarehouse(), programs: { path: "/api/institutions", status: "ok", rows: programs, error: null } },
    { channel: null, state: null, cip: null, outlook: null, lens: "students" }
  );
  assert.equal(series.points.length, 1);
  assert.equal(series.points[0]?.cost, 20000);
  assert.equal(series.points[0]?.earnings, 70000);
});

test("parent cost series requires net price or tuition plus earnings", () => {
  const rows = parseInstitutions({
    institutions: [
      { name: "No Earnings College", net_price: 10000, state: "NY" },
      { name: "Priced College", net_price: 15000, median_earnings: 50000, state: "NY", source_url: "https://collegescorecard.ed.gov/data/" },
    ],
  });
  const series = costEarningsSeries(
    { ...emptyWarehouse(), institutions: { path: "/api/institutions", status: "ok", rows, error: null } },
    { channel: null, state: "NY", cip: null, outlook: null, lens: "parents" }
  );
  assert.equal(series.points.length, 1);
  assert.equal(series.points[0]?.label, "Priced College");
  assert.match(series.metric, /net price/i);
});

test("wage distribution and projections do not invent bars", () => {
  const emptyWages = wageDistribution(emptyWarehouse(), {
    channel: null,
    state: null,
    cip: null,
    outlook: null,
    lens: null,
  });
  assert.equal(emptyWages.buckets.length, 0);
  assert.match(emptyWages.emptyReason ?? "", /not on this API/);

  const snapshot = emptyWarehouse();
  snapshot.wages = {
    path: "/api/wages",
    status: "ok",
    error: null,
    rows: [
      {
        soc_code: "47-2111",
        occupation_title: "Electricians",
        area_code: "US",
        area_name: "United States",
        area_type: "national",
        period: "2025",
        median_annual_wage: 61000,
        mean_annual_wage: null,
        employment: 100,
        source: "bls",
        source_url: "https://www.bls.gov/oes/",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
    ],
  };
  snapshot.projections = {
    path: "/api/projections",
    status: "ok",
    error: null,
    rows: [
      {
        soc_code: "47-2111",
        occupation_title: "Electricians",
        occupation_type: "line",
        period: "2024-34",
        change_percent: 9.5,
        employment_base: null,
        employment_proj: null,
        typical_education: null,
        source: "bls_ep",
        source_url: "https://www.bls.gov/emp/tables.htm",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
      {
        soc_code: "43-9021",
        occupation_title: "Data entry keyers",
        occupation_type: "line",
        period: "2024-34",
        change_percent: -12,
        employment_base: null,
        employment_proj: null,
        typical_education: null,
        source: "bls_ep",
        source_url: "https://www.bls.gov/emp/tables.htm",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
    ],
  };
  const wages = wageDistribution(snapshot, { channel: null, state: null, cip: null, outlook: null, lens: null });
  assert.equal(wages.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 1);
  const students = projectionSeries(snapshot, { channel: null, state: null, cip: null, outlook: null, lens: "students" });
  assert.deepEqual(students.bars.map((bar) => bar.label), ["Electricians"]);
  const parents = projectionSeries(snapshot, { channel: null, state: null, cip: null, outlook: null, lens: "parents" });
  assert.equal(parents.bars[0]?.label, "Data entry keyers");
  assert.equal(parents.bars[0]?.value, -12);
  const mix = channelMix(snapshot, { channel: null, state: null, cip: null, outlook: null, lens: null });
  assert.equal(mix.slices.find((slice) => slice.channel === "trade")?.count, 1);
  assert.equal(mix.slices.find((slice) => slice.channel === "automation")?.count, 1);
});

test("econ parser renders published fields and does not compute a rate", () => {
  const points = parseEcon({
    census: [
      {
        name: "United States",
        geo_id: "US",
        median_household_income: 77000,
        unemployed: 100,
        civilian_labor_force: 1000,
        year: "2023",
        source: "census",
        source_url: "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
    ],
    fred: [
      {
        series_id: "UNRATE",
        title: "Civilian unemployment rate",
        value: 4.2,
        date: "2026-08-01",
        unit: "percent",
        source: "fred",
        source_url: "https://fred.stlouisfed.org/series/UNRATE",
        fetched_at: "2026-09-21T00:00:00.000Z",
      },
    ],
  });
  assert.equal(points.some((point) => point.metric === "Unemployment rate"), false);
  assert.equal(points.some((point) => point.metric === "Unemployed" && point.value === 100), true);
  assert.equal(points.some((point) => point.dataset === "fred" && point.value === 4.2), true);
});

test("feed strip stays dark without fetched_at and hides synthetic insights when demo is off", () => {
  const strip = buildFeedStrip(emptyWarehouse(), { latestFetchedAt: "2026-09-21T18:00:00.000Z" });
  assert.equal(strip.cards.length, 10);
  assert.equal(strip.cards.every((card) => card.live === false), true);
  assert.match(strip.detail, /not tick-by-tick|not a live tick|Periodic/i);
  assert.match(strip.detail, /latest_fetched_at/);
  assert.equal(strip.cards.find((card) => card.id === "scorecard")?.sourceUrl, null);
  assert.match(strip.cards.find((card) => card.id === "scorecard")?.homeUrl ?? "", /^https:\/\//);

  const live = emptyWarehouse();
  live.feeds = {
    path: "/api/feeds",
    status: "ok",
    error: null,
    rows: [
      {
        id: "scorecard",
        label: "Scorecard",
        source: "scorecard",
        fetched_at: "2026-09-21T18:00:00.000Z",
        source_url: "https://collegescorecard.ed.gov/data/",
        count: 10,
      },
    ],
  };
  const scored = buildFeedStrip(live);
  const card = scored.cards.find((item) => item.id === "scorecard");
  assert.equal(card?.live, true);
  assert.equal(card?.sourceUrl, "https://collegescorecard.ed.gov/data/");
  assert.match(card?.note ?? "", /Last pulled/);

  const rows: InsightRow[] = [
    {
      id: "seed",
      title: "Demo tuition",
      value: "$1",
      detail: "seed",
      source: "synthetic",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    {
      id: "live",
      title: "OEWS wage",
      value: "$61,000",
      detail: "published",
      source: "bls",
      source_url: "https://www.bls.gov/oes/",
      fetched_at: "2026-09-21T00:00:00.000Z",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
  ];
  assert.equal(visibleApiInsights(rows, false).length, 1);
  assert.equal(visibleApiInsights(rows, true).length, 2);
});

test("student lens leads with cost, growth, apprenticeship, and credentials", () => {
  const tiles = tilesForLens(
    decisionTiles(emptyWarehouse(), { channel: null, state: null, cip: null, outlook: null, lens: "students" }),
    "students"
  );
  assert.match(tiles[0]?.title ?? "", /Debt vs median earnings|Fastest growing|apprenticeship|license|Certification/i);
  assert.equal(tiles.filter((item) => item.lenses.includes("students") && item.empty).length > 0, true);
  assert.equal(tiles.some((item) => item.value === "$0" || item.value === "0%" ), false);
});

test("loadWarehouse treats 404 as missing and parses a live wages payload", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/wages")) {
      return new Response(
        JSON.stringify({
          wages: [
            {
              occupation_title: "Plumbers",
              area_type: "national",
              median_annual_wage: 60000,
              source: "bls",
              source_url: "https://www.bls.gov/oes/",
              fetched_at: "2026-09-21T00:00:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("nope", { status: 404 });
  };
  const snapshot = await loadWarehouse("https://example.test", fetchImpl);
  assert.equal(snapshot.wages.status, "ok");
  assert.equal(snapshot.wages.rows[0]?.occupation_title, "Plumbers");
  assert.equal(snapshot.institutions.status, "missing");
  assert.equal(snapshot.projections.status, "missing");
  assert.equal(snapshot.feeds.status, "missing");
  const strip = buildFeedStrip(snapshot);
  assert.equal(strip.cards.find((card) => card.id === "oews")?.live, true);
  assert.equal(strip.cards.find((card) => card.id === "census")?.live, false);
});

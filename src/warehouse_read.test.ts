import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createApp } from "./app";
import { econFromAcs } from "./ingest/econ_rows";
import { runIngest } from "./ingest/run";
import {
  isMissingRelation,
  readWarehouseList,
  readWarehouseStats,
} from "./ingest/warehouse_pg";
import type { AcsPlace } from "./ingest/adapters/census";
import type { Store } from "./types";
import { createMemoryWarehouse } from "./warehouse_memory";
import {
  likeContains,
  parseWarehouseListQuery,
  WAREHOUSE_DEFAULT_LIMIT,
  WAREHOUSE_MAX_LIMIT,
} from "./warehouse_query";

const FETCHED = "2026-09-22T00:33:26.884Z";
const RECENT = new Date().toISOString();
const FIVE_DAYS_AGO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

function institution(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    unitid: "1",
    name: "Alpha College",
    city: "Boise",
    state: "ID",
    control: "public",
    operating: true,
    tuition_in_state: 8000,
    tuition_out_state: 20000,
    net_price: 12000,
    median_earnings: 42000,
    source: "scorecard",
    source_url: "https://collegescorecard.ed.gov/data/",
    fetched_at: RECENT,
    ...partial,
  };
}

function projection(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "p1",
    soc_code: "29-1141.00",
    occupation_title: "Registered Nurses",
    period: "2025-2035",
    employment_base: 100,
    employment_proj: 112,
    change_percent: 12,
    typical_education: "Bachelor's degree",
    source: "bls_ep",
    source_url: "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm",
    fetched_at: RECENT,
    ...partial,
  };
}

const seed = {
  institutions: [
    institution({ unitid: "1", name: "Alpha College", state: "ID", city: "Boise" }),
    institution({
      unitid: "2",
      name: "Beta Institute",
      state: "TX",
      city: "Austin",
      control: "private_nonprofit",
    }),
    institution({ unitid: "3", name: "Gamma Tech", state: "TX", city: "Dallas" }),
  ],
  programs: [
    {
      id: "prog-1",
      institution_unitid: "1",
      institution_name: "Alpha College",
      state: "ID",
      cip_code: "11.0701",
      cip_title: "Computer Science",
      credential_level: "3",
      credential_title: "Bachelor's",
      median_earnings: 70000,
      median_debt: 20000,
      source: "scorecard",
      source_url: "https://collegescorecard.ed.gov/data/",
      fetched_at: RECENT,
    },
  ],
  sponsors: [
    {
      sponsor_key: "s1",
      name: "Boise Electric JATC",
      organization_type: "union",
      city: "Boise",
      state: "ID",
      source: "apprenticeship_gov",
      source_url: "https://www.apprenticeship.gov/",
      fetched_at: FIVE_DAYS_AGO,
    },
  ],
  projections: [
    projection({}),
    projection({
      id: "p2",
      soc_code: "43-9022",
      occupation_title: "Word Processors",
      change_percent: -4,
      employment_proj: 90,
    }),
  ],
  wages: [
    {
      id: "w1",
      soc_code: "29-1141",
      occupation_title: "Registered Nurses",
      area_code: "US",
      area_name: "United States",
      area_type: "national",
      period: "2025",
      median_annual_wage: 90000,
      source: "bls",
      source_url: "https://www.bls.gov/oes/tables.htm",
      fetched_at: RECENT,
    },
  ],
  credentials: [
    {
      credential_id: "ce-1",
      name: "Welding Certificate",
      credential_type: "Certificate",
      organization: "Example College",
      state: "ID",
      cip_code: "48.0508",
      source: "credential_engine",
      source_url: "https://credentialengine.org/",
      fetched_at: RECENT,
    },
  ],
  econ: [
    {
      id: "fred-unrate",
      series_id: "UNRATE",
      title: "Unemployment rate",
      geo_id: "US",
      geo_name: "United States",
      period: "2026-08-01",
      value: 4.3,
      unit: "percent",
      source: "fred",
      source_url: "https://fred.stlouisfed.org/series/UNRATE",
      fetched_at: FIVE_DAYS_AGO,
    },
  ],
};

function insightStore(): Store {
  const insights = [
    {
      id: "1",
      title: "Synthetic KPI",
      value: "1",
      detail: "",
      source: "synthetic" as const,
      source_url: null,
      fetched_at: null,
      created_at: FETCHED,
      updated_at: FETCHED,
    },
    {
      id: "2",
      title: "Manual KPI",
      value: "2",
      detail: "",
      source: "manual" as const,
      source_url: null,
      fetched_at: null,
      created_at: FETCHED,
      updated_at: FETCHED,
    },
  ];
  return {
    async insertEvent(value) {
      return {
        id: "e1",
        ...value,
        created_at: FETCHED,
      };
    },
    async listEvents() {
      return [];
    },
    async upsertInsight() {
      throw new Error("not used");
    },
    async listInsights(query) {
      return insights.filter((row) => query?.includeDemo !== false || row.source !== "synthetic");
    },
  };
}

test("warehouse query validation rejects bad limit, outlook, and source", () => {
  assert.equal(parseWarehouseListQuery({}).ok, true);
  if (parseWarehouseListQuery({}).ok) {
    assert.equal(parseWarehouseListQuery({ limit: "2", offset: "1" }).ok, true);
  }
  const ok = parseWarehouseListQuery({ limit: "2", offset: "1" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.limit, 2);
    assert.equal(ok.value.offset, 1);
  }
  const capped = parseWarehouseListQuery({ limit: "9999" });
  assert.equal(capped.ok, true);
  if (capped.ok) assert.equal(capped.value.limit, WAREHOUSE_MAX_LIMIT);

  const bad = parseWarehouseListQuery({
    limit: "0",
    offset: "-1",
    outlook: "sideways",
    source: "synthetic",
    q: "x".repeat(201),
    soc: "drop table",
    cip: "11 01",
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    const fields = bad.details.map((detail) => detail.field);
    assert.ok(fields.includes("limit"));
    assert.ok(fields.includes("offset"));
    assert.ok(fields.includes("outlook"));
    assert.ok(fields.includes("source"));
    assert.ok(fields.includes("q"));
    assert.ok(fields.includes("soc"));
    assert.ok(fields.includes("cip"));
  }
  assert.equal(WAREHOUSE_DEFAULT_LIMIT, 50);
  assert.equal(likeContains("100%_"), "%100\\%\\_%");
});

test("GET warehouse lists paginate, filter, and carry provenance", async () => {
  const warehouse = createMemoryWarehouse(seed);
  const app = createApp(insightStore(), { allowDemo: false, warehouse });
  await app.ready();
  try {
    const page = await app.inject({ method: "GET", url: "/api/institutions?limit=1&offset=1" });
    assert.equal(page.statusCode, 200);
    const body = page.json() as {
      institutions: Record<string, unknown>[];
      limit: number;
      offset: number;
      total: number;
    };
    assert.equal(body.total, 3);
    assert.equal(body.limit, 1);
    assert.equal(body.offset, 1);
    assert.equal(body.institutions.length, 1);
    assert.equal(body.institutions[0]?.name, "Beta Institute");
    assert.equal(body.institutions[0]?.source, "scorecard");
    assert.equal(body.institutions[0]?.source_url, "https://collegescorecard.ed.gov/data/");
    assert.equal(typeof body.institutions[0]?.fetched_at, "string");

    const texas = await app.inject({ method: "GET", url: "/api/institutions?state=tx&type=public" });
    const texasBody = texas.json() as { institutions: { name: string }[]; total: number };
    assert.equal(texasBody.total, 1);
    assert.equal(texasBody.institutions[0]?.name, "Gamma Tech");

    const trade = await app.inject({ method: "GET", url: "/api/institutions?channel=trade" });
    assert.equal((trade.json() as { total: number }).total, 0);
    const university = await app.inject({
      method: "GET",
      url: "/api/institutions?channel=university",
    });
    assert.equal((university.json() as { total: number }).total, 3);

    const cip = await app.inject({ method: "GET", url: "/api/programs?cip=11.07&q=computer" });
    const programs = cip.json() as { programs: { cip_code: string; state: string }[]; total: number };
    assert.equal(programs.total, 1);
    assert.equal(programs.programs[0]?.cip_code, "11.0701");
    assert.equal(programs.programs[0]?.state, "ID");

    const growing = await app.inject({
      method: "GET",
      url: "/api/projections?outlook=grow&soc=29-1141",
    });
    const growBody = growing.json() as {
      projections: { occupation_title: string; change_percent: number; source: string }[];
      total: number;
    };
    assert.equal(growBody.total, 1);
    assert.equal(growBody.projections[0]?.occupation_title, "Registered Nurses");
    assert.equal(growBody.projections[0]?.source, "bls_ep");
    assert.ok((growBody.projections[0]?.change_percent ?? 0) > 0);

    const declining = await app.inject({ method: "GET", url: "/api/projections?outlook=decline" });
    const declineBody = declining.json() as { projections: { occupation_title: string }[]; total: number };
    assert.equal(declineBody.total, 1);
    assert.equal(declineBody.projections[0]?.occupation_title, "Word Processors");

    const badOutlook = await app.inject({ method: "GET", url: "/api/projections?outlook=flat" });
    assert.equal(badOutlook.statusCode, 400);
    assert.equal(badOutlook.json().error, "validation_failed");

    const wages = await app.inject({ method: "GET", url: "/api/wages?soc=29-1141&source=bls" });
    assert.equal((wages.json() as { total: number }).total, 1);

    const creds = await app.inject({ method: "GET", url: "/api/credentials?state=ID&q=weld" });
    const credBody = creds.json() as { credentials: { source: string; source_url: string }[] };
    assert.equal(credBody.credentials.length, 1);
    assert.equal(credBody.credentials[0]?.source, "credential_engine");
    assert.match(credBody.credentials[0]?.source_url ?? "", /^https:\/\//);

    const econ = await app.inject({ method: "GET", url: "/api/econ?source=fred&state=US" });
    const econBody = econ.json() as { econ: { series_id: string; fetched_at: string }[]; total: number };
    assert.equal(econBody.total, 1);
    assert.equal(econBody.econ[0]?.series_id, "UNRATE");
    assert.equal(typeof econBody.econ[0]?.fetched_at, "string");
  } finally {
    await app.close();
  }
});

test("GET /api/feeds and /api/meta report freshness without inventing rows", async () => {
  const warehouse = createMemoryWarehouse(seed);
  const app = createApp(insightStore(), { allowDemo: false, warehouse });
  await app.ready();
  try {
    const feeds = await app.inject({ method: "GET", url: "/api/feeds" });
    assert.equal(feeds.statusCode, 200);
    const body = feeds.json() as {
      feeds: {
        source: string;
        cadence: string;
        cadence_label: string;
        status: string;
        rows: number;
        last_fetched_at: string | null;
      }[];
    };
    const bySource = new Map(body.feeds.map((feed) => [feed.source, feed]));
    assert.equal(bySource.get("scorecard")?.status, "ok");
    assert.equal(bySource.get("scorecard")?.cadence, "release");
    assert.match(bySource.get("scorecard")?.cadence_label ?? "", /Release-driven/);
    assert.equal(bySource.get("fred")?.cadence, "daily");
    assert.equal(bySource.get("fred")?.status, "stale");
    assert.match(bySource.get("fred")?.cadence_label ?? "", /Daily-ish/);
    assert.equal(bySource.get("careeronestop")?.cadence, "weekly");
    assert.equal(bySource.get("careeronestop")?.status, "error");
    assert.equal(bySource.get("careeronestop")?.rows, 0);
    assert.equal(bySource.get("apprenticeship_gov")?.status, "ok");
    assert.equal(bySource.get("bls")?.status, "ok");

    const meta = await app.inject({ method: "GET", url: "/api/meta" });
    const metaBody = meta.json() as {
      allow_demo: boolean;
      warehouse: { institutions: number; credentials: number };
      feeds: { source: string }[];
    };
    assert.equal(metaBody.allow_demo, false);
    assert.equal(metaBody.warehouse.institutions, 3);
    assert.equal(metaBody.warehouse.credentials, 1);
    assert.ok(metaBody.feeds.some((feed) => feed.source === "credential_engine"));

    const stats = await app.inject({ method: "GET", url: "/api/warehouse" });
    assert.equal(stats.statusCode, 200);
    assert.equal(stats.json().warehouse.projections, 2);
  } finally {
    await app.close();
  }
});

test("demo-off insights hide synthetic and public POST still cannot mint reserved sources", async () => {
  const app = createApp(insightStore(), { allowDemo: false });
  await app.ready();
  try {
    const insights = await app.inject({ method: "GET", url: "/api/insights" });
    assert.equal(insights.statusCode, 200);
    const titles = (insights.json() as { insights: { title: string }[] }).insights.map(
      (row) => row.title
    );
    assert.deepEqual(titles, ["Manual KPI"]);

    const reserved = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { "content-type": "application/json" },
      payload: {
        channel: "trade",
        title: "Spoof",
        source: "bls",
        source_url: "https://www.bls.gov/oes/tables.htm",
        fetched_at: FETCHED,
      },
    });
    assert.equal(reserved.statusCode, 400);
    assert.equal(reserved.json().error, "validation_failed");

    const ingest = await app.inject({
      method: "POST",
      url: "/api/ingest/fred",
      headers: { authorization: "Bearer secret-token" },
    });
    assert.equal(ingest.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("empty warehouse lists are empty rather than invented", async () => {
  const app = createApp(insightStore(), { allowDemo: false });
  await app.ready();
  try {
    const res = await app.inject({ method: "GET", url: "/api/occupations?q=nurse" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      occupations: [],
      limit: WAREHOUSE_DEFAULT_LIMIT,
      offset: 0,
      total: 0,
    });
    const feeds = await app.inject({ method: "GET", url: "/api/feeds" });
    const rows = (feeds.json() as { feeds: { status: string; rows: number }[] }).feeds;
    assert.ok(rows.every((feed) => feed.status === "error" && feed.rows === 0));
  } finally {
    await app.close();
  }
});

test("pg list maps numeric strings and binds limit; missing tables are empty", async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      const text = String(sql);
      queries.push({ sql: text, params: params ?? [] });
      if (text.includes("to_regclass")) return { rows: [{ rel: null }] };
      if (text.includes("count(*)")) return { rows: [{ n: "1" }] };
      return {
        rows: [
          {
            unitid: "100654",
            name: "Test University",
            city: "Normal",
            state: "AL",
            control: "public",
            operating: true,
            tuition_in_state: "12000.50",
            tuition_out_state: null,
            net_price: null,
            median_earnings: "45000",
            source: "scorecard",
            source_url: "https://collegescorecard.ed.gov/data/",
            fetched_at: new Date(FETCHED),
          },
        ],
      };
    },
  };

  const page = await readWarehouseList(pool as never, "institutions", {
    limit: 25,
    offset: 5,
    q: "100%",
    state: "AL",
  });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0]?.tuition_in_state, 12000.5);
  assert.equal(page.rows[0]?.median_earnings, 45000);
  assert.equal(page.rows[0]?.fetched_at, FETCHED);
  assert.equal(page.rows[0]?.source_url, "https://collegescorecard.ed.gov/data/");
  const select = queries.find((query) => query.sql.includes("ORDER BY"));
  assert.ok(select);
  assert.match(select?.sql ?? "", /LIMIT \$/);
  assert.equal(select?.sql.includes("100%"), false);
  assert.deepEqual(select?.params.slice(-2), [25, 5]);
  assert.ok(select?.params.includes(likeContains("100%")));

  queries.length = 0;
  const missing = await readWarehouseList(pool as never, "credentials", {
    limit: 50,
    offset: 0,
  });
  assert.deepEqual(missing, { rows: [], limit: 50, offset: 0, total: 0 });
  assert.equal(isMissingRelation(Object.assign(new Error("missing"), { code: "42P01" })), true);
});

test("pg stats keep institution counts when later tables are absent", async () => {
  const pool = {
    async query(sql: string) {
      const text = String(sql);
      const table = /FROM (\w+)/.exec(text)?.[1] ?? "";
      const missing = new Set(["credentials", "licenses", "certifications", "econ_indicators"]);
      if (missing.has(table)) {
        const err = new Error(`relation ${table} does not exist`) as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      if (text.includes("count(*)")) {
        return { rows: [{ n: table === "institutions" ? "6243" : "0" }] };
      }
      if (table === "institutions") {
        return { rows: [{ fetched_at: new Date(FETCHED) }] };
      }
      return { rows: [{ fetched_at: null }] };
    },
  };
  const stats = await readWarehouseStats(pool as never);
  assert.equal(stats.institutions, 6243);
  assert.equal(stats.credentials, 0);
  assert.equal(stats.licenses, 0);
  assert.equal(stats.econ_indicators, 0);
  assert.equal(stats.latest_fetched_at, FETCHED);
});

test("pg credentials reader maps alias columns", async () => {
  const pool = {
    async query(sql: string) {
      const text = String(sql);
      if (text.includes("to_regclass")) return { rows: [{ rel: "credentials" }] };
      if (text.includes("information_schema")) {
        return {
          rows: ["id", "title", "source", "source_url", "fetched_at"].map((column_name) => ({
            column_name,
          })),
        };
      }
      if (text.includes("count(*)")) return { rows: [{ n: "1" }] };
      return {
        rows: [
          {
            id: "ce-9",
            title: "Welder cert",
            source: "credential_engine",
            source_url: "https://credentialengine.org/",
            fetched_at: FETCHED,
          },
        ],
      };
    },
  };
  const page = await readWarehouseList(pool as never, "credentials", { limit: 50, offset: 0 });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0]?.credential_id, "ce-9");
  assert.equal(page.rows[0]?.name, "Welder cert");
  assert.equal(page.rows[0]?.source, "credential_engine");
  assert.equal(page.rows[0]?.fetched_at, FETCHED);
});

test("ACS econ rows keep published counts and do not store a computed rate", () => {
  const place: AcsPlace = {
    name: "Idaho",
    geo_id: "16",
    median_household_income: 70000,
    per_capita_income: null,
    civilian_labor_force: 900000,
    unemployed: 30000,
    population: 1900000,
    year: "2023",
    source: "census",
    source_url: "https://api.census.gov/data/2023/acs/acs5",
    fetched_at: FETCHED,
  };
  const rows = econFromAcs([place]);
  assert.ok(rows.some((row) => row.series_id === "B23025_005E" && row.value === 30000));
  assert.ok(rows.some((row) => row.series_id === "B19013_001E" && row.value === 70000));
  assert.equal(
    rows.some((row) => row.series_id === "B19301_001E"),
    false
  );
  assert.equal(
    rows.some((row) => /rate/i.test(row.series_id) || /rate/i.test(row.title)),
    false
  );
  assert.ok(rows.every((row) => row.source === "census" && row.fetched_at === FETCHED));
});

test("live ingest upserts CareerOneStop and Census rows into the warehouse", async () => {
  const warehouse = createMemoryWarehouse();
  await runIngest({
    source: "careeronestop",
    file: path.join("fixtures", "careeronestop_sample.json"),
    warehouse,
    skipDerive: true,
  });
  assert.ok((warehouse.data.licenses?.length ?? 0) >= 1);
  assert.equal(warehouse.data.licenses?.[0]?.source, "careeronestop");
  assert.match(String(warehouse.data.licenses?.[0]?.source_url), /^https:\/\//);
  assert.ok((warehouse.data.certifications?.length ?? 0) >= 1);

  const census = createMemoryWarehouse();
  await runIngest({
    source: "census",
    file: path.join("fixtures", "census_acs5_2023_sample.json"),
    warehouse: census,
    skipDerive: true,
  });
  assert.ok((census.data.econ?.length ?? 0) > 0);
  assert.ok(census.data.econ?.every((row) => row.source === "census"));
  assert.equal(
    census.data.econ?.some((row) => String(row.series_id).toLowerCase().includes("rate")),
    false
  );
});

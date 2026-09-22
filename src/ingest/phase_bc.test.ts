import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseBeaFile } from "./adapters/bea";
import { fastestChanging, parseEpTable, parseEpXlsx } from "./adapters/bls_ep";
import {
  parseCareerOneStopPayload,
  parseWageCompare,
  stripGeocodes,
} from "./adapters/careeronestop";
import { parseAcsFile, unemploymentRate } from "./adapters/census";
import { parseFredFile, parseFredObservations, FRED_CATALOG } from "./adapters/fred";
import { keyedAdapterEnabled } from "./credentials";
import {
  deriveFromAcs,
  deriveFromBea,
  deriveFromCareerOneStop,
  deriveFromFred,
  deriveFromProjections,
} from "./derive";
import { INGEST_SOURCES, ingestCensus, runIngest } from "./run";

const FIXTURES = path.resolve(process.cwd(), "fixtures");
const FETCHED = "2026-09-22T00:00:00.000Z";
const tsx = path.resolve(process.cwd(), "node_modules/.bin/tsx");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

test("ingest source list wires Phase B/C adapters", () => {
  for (const name of ["bls_ep", "careeronestop", "census", "bea", "fred", "all"] as const) {
    assert.equal(INGEST_SOURCES.includes(name), true, name);
  }
  assert.equal(keyedAdapterEnabled("bls_ep", {}), true);
  assert.equal(keyedAdapterEnabled("census", {}), false);
  assert.equal(keyedAdapterEnabled("census", { CENSUS_API_KEY: "present" }), true);
  assert.equal(keyedAdapterEnabled("careeronestop", { CAREERONESTOP_USER_ID: "u" }), false);
  assert.equal(
    keyedAdapterEnabled("careeronestop", {
      CAREERONESTOP_USER_ID: "u",
      CAREERONESTOP_API_TOKEN: "t",
    }),
    true
  );
  assert.equal(keyedAdapterEnabled("bea", {}), false);
  assert.equal(keyedAdapterEnabled("fred", { FRED_API_KEY: "k" }), true);
});

test("bls_ep parser reads Table 1.2 excerpt in persons and ranks line items", () => {
  const provenance = {
    source_url: "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm",
    fetched_at: FETCHED,
  };
  const rows = parseEpTable(readFixture("bls_ep_table_1_2_sample.csv"), provenance);
  const total = rows.find((row) => row.occupation_title === "Total, all occupations");
  assert.ok(total);
  assert.equal(total?.source, "bls_ep");
  assert.equal(total?.period, "2024-2034");
  assert.equal(total?.employment_base, 169956100);
  assert.equal(total?.employment_proj, 175167900);
  assert.equal(total?.change_percent, 3.1);
  assert.equal(total?.annual_openings, 18863300);
  assert.equal(total?.median_annual_wage, 49500);
  assert.equal(total?.typical_education, null);
  const chiefs = rows.find((row) => row.soc_code === "11-1011");
  assert.equal(chiefs?.typical_education, "Bachelor's degree");
  assert.equal(chiefs?.employment_base, 309400);
  assert.equal(fastestChanging(rows, "grow")?.occupation_title, "Wind turbine service technicians");
  assert.equal(fastestChanging(rows, "grow")?.change_percent, 49.9);
  assert.equal(fastestChanging(rows, "decline")?.occupation_title, "Word processors and typists");
  assert.equal(fastestChanging(rows, "decline")?.change_percent, -36.1);
  const derived = deriveFromProjections(rows);
  assert.ok(derived.insights.some((row) => row.source === "bls_ep" && row.value.includes("3.1%")));
  assert.ok(derived.insights.some((row) => row.value.includes("Wind turbine service technicians")));
  assert.ok(derived.events.every((row) => row.source === "bls_ep" && row.source_url && row.fetched_at));

  const htmlRows = parseEpTable(readFixture("bls_ep_table_1_2_sample.html"), provenance);
  const htmlTotal = htmlRows.find((row) => row.occupation_title === "Total, all occupations");
  assert.equal(htmlTotal?.employment_base, 169956100);
  assert.equal(fastestChanging(htmlRows, "decline")?.change_percent, -36.1);
});

test("bls_ep xlsx fixture parses the same total employment", async () => {
  const rows = await parseEpXlsx(readFileSync(path.join(FIXTURES, "bls_ep_table_1_2_sample.xlsx")), {
    source_url: "https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.xlsx",
    fetched_at: FETCHED,
  });
  const total = rows.find((row) => row.occupation_title === "Total, all occupations");
  assert.equal(total?.employment_base, 169956100);
  assert.equal(total?.change_percent, 3.1);
  const wind = rows.find((row) => row.soc_code === "49-9081");
  assert.equal(wind?.change_percent, 49.9);
  assert.equal(wind?.annual_openings, 2300);
});

test("dry-run bls_ep --file reports projections without a database", async () => {
  const report = await runIngest({
    source: "bls_ep",
    file: path.join(FIXTURES, "bls_ep_table_1_2_sample.csv"),
    dryRun: true,
  });
  assert.equal(report.dryRun, true);
  assert.equal(report.sources[0]?.source, "bls_ep");
  assert.ok((report.sources[0]?.rows ?? 0) >= 10);
  assert.ok(report.derivedInsights >= 3);
  assert.ok(report.derivedEvents >= 2);
});

test("careeronestop parser drops contacts and Bing geocodes and attributes DOLETA and DEED", () => {
  const raw = JSON.parse(readFixture("careeronestop_sample.json")) as {
    licenses: { LicenseList: Record<string, unknown>[] };
  };
  raw.licenses.LicenseList[0].Latitude = 99.1;
  raw.licenses.LicenseList[0].Longitude = -99.2;
  const stripped = stripGeocodes(raw);
  assert.equal(JSON.stringify(stripped).includes("99.1"), false);
  const bundle = parseCareerOneStopPayload(raw, { fetched_at: FETCHED });
  assert.equal(bundle.licenses.length, 2);
  assert.equal(bundle.licenses[0]?.state, "Montana");
  assert.equal(bundle.certifications[0]?.name, "Nurse Manager and Leader");
  assert.equal(bundle.certifications[0]?.source, "careeronestop");
  const national = bundle.wages.find((row) => row.area_type === "national");
  assert.equal(national?.median_annual_wage, 111680);
  assert.equal(national?.median_hourly_wage, 53.69);
  assert.equal(national?.period, "2020");
  const encoded = JSON.stringify(bundle);
  assert.equal(encoded.includes("99.1"), false);
  assert.equal(encoded.includes("@"), false);
  assert.equal(encoded.includes("4068412397"), false);
  const derived = deriveFromCareerOneStop(bundle);
  assert.ok(derived.events.length >= 2);
  assert.ok(
    derived.events
      .filter((row) => row.external_id.startsWith("careeronestop:license-state:"))
      .every(
        (row) =>
          row.description?.includes("Employment and Training Administration") &&
          row.description.includes("DEED")
      )
  );
  const poisoned = parseWageCompare(
    {
      OccupationDetail: {
        OccupationTitle: "Nurse Practitioners",
        Wages: {
          NationalWagesList: [
            { RateType: "Annual", Median: "111680", AreaName: "United States", StFips: "00", Latitude: 1.5 },
          ],
          BLSAreaWagesList: [{ RateType: "Annual", Median: "1", AreaName: "Metro", Latitude: 2.5 }],
          WageYear: "2020",
        },
      },
    },
    { fetched_at: FETCHED }
  );
  assert.equal(JSON.stringify(poisoned).includes("1.5"), false);
  assert.equal(JSON.stringify(poisoned).includes("2.5"), false);
  assert.equal(poisoned.length, 1);
});

test("census ACS fixture keeps published counts and the labor-force unemployment ratio", async () => {
  const extract = parseAcsFile(JSON.parse(readFixture("census_acs5_2023_sample.json")), FETCHED);
  assert.equal(extract.year, "2023");
  const nation = extract.places.find((row) => row.name === "United States");
  assert.equal(nation?.median_household_income, 78538);
  assert.equal(nation?.population, 332387540);
  assert.equal(nation?.source, "census");
  assert.match(nation?.source_url ?? "", /^https:\/\/api\.census\.gov\/data\/2023\/acs\/acs5/);
  assert.equal(nation?.source_url.includes("key="), false);
  const rate = nation ? unemploymentRate(nation) : null;
  assert.ok(rate != null);
  assert.ok(Math.abs((rate ?? 0) - (8759317 / 168567852) * 100) < 1e-9);
  const derived = deriveFromAcs(extract.places);
  assert.ok(derived.insights.some((row) => row.value.includes("78,538") && row.source === "census"));
  assert.ok(derived.events.some((row) => row.title.includes("District of Columbia")));
  const report = await runIngest({
    source: "census",
    file: path.join(FIXTURES, "census_acs5_2023_sample.json"),
    dryRun: true,
  });
  assert.equal(report.sources[0]?.source, "census");
  assert.equal(report.sources[0]?.rows, 4);
});

test("bea parser keeps states, drops BEA regions, and reads comma-formatted values", async () => {
  const extract = parseBeaFile(JSON.parse(readFixture("bea_regional_sample.json")), FETCHED);
  const names = extract.income.map((row) => row.geo_name).sort();
  assert.deepEqual(names, ["Alabama", "Alaska", "Arizona", "United States"]);
  assert.equal(extract.income.find((row) => row.geo_name === "Alabama")?.value, 35706);
  assert.equal(extract.income.find((row) => row.geo_name === "United States")?.value, 44402);
  const derived = deriveFromBea(extract);
  assert.ok(derived.events.some((row) => row.title.startsWith("Alaska")));
  assert.ok(derived.insights.some((row) => row.source === "bea" && row.value.includes("44,402")));
  const report = await runIngest({
    source: "bea",
    file: path.join(FIXTURES, "bea_regional_sample.json"),
    dryRun: true,
  });
  assert.equal(report.sources[0]?.extra?.income, 4);
});

test("fred parser keeps published observations and skips the missing sentinel", async () => {
  const points = parseFredFile(JSON.parse(readFixture("fred_observations_sample.json")), FETCHED);
  const unrate = points.find((row) => row.series_id === "UNRATE");
  const cpi = points.find((row) => row.series_id === "CPIAUCSL");
  assert.equal(unrate?.value, 14.8);
  assert.equal(unrate?.date, "2020-04-01");
  assert.equal(cpi?.value, 256.032);
  assert.match(unrate?.source_url ?? "", /^https:\/\/fred\.stlouisfed\.org\/series\/UNRATE$/);
  const cpiSeries = FRED_CATALOG.find((row) => row.id === "CPIAUCSL");
  assert.ok(cpiSeries);
  // "." is FRED's missing sentinel. 258.076 is the March 2020 seasonally adjusted CPI-U (CUSR0000SA0).
  const skipped = parseFredObservations(
    {
      observations: [
        { date: "2020-04-01", value: "." },
        { date: "2020-03-01", value: "258.076" },
      ],
    },
    cpiSeries,
    FETCHED
  );
  assert.equal(skipped?.value, 258.076);
  assert.equal(skipped?.date, "2020-03-01");
  const derived = deriveFromFred(points);
  assert.ok(derived.insights.every((row) => row.source === "fred" && row.fetched_at === FETCHED));
  const report = await runIngest({
    source: "fred",
    file: path.join(FIXTURES, "fred_observations_sample.json"),
    dryRun: true,
  });
  assert.equal(report.sources[0]?.rows, 2);
});

test("keyed adapters fail clearly when the env key is missing", async () => {
  const previous = process.env.CENSUS_API_KEY;
  delete process.env.CENSUS_API_KEY;
  try {
    await assert.rejects(() => ingestCensus({ source: "census", dryRun: true }), /CENSUS_API_KEY/);
  } finally {
    if (previous) process.env.CENSUS_API_KEY = previous;
  }
});

test("CLI dry-run bls_ep --file exits 0 and census without a key exits 1", () => {
  const ok = spawnSync(
    tsx,
    [
      "src/ingest/cli.ts",
      "--source",
      "bls_ep",
      "--file",
      "fixtures/bls_ep_table_1_2_sample.csv",
      "--dry-run",
    ],
    { encoding: "utf8" }
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /"source": "bls_ep"/);
  const help = spawnSync(tsx, ["src/ingest/cli.ts", "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /careeronestop/);
  assert.match(help.stdout, /CENSUS_API_KEY/);
  const missing = spawnSync(tsx, ["src/ingest/cli.ts", "--source", "census", "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, CENSUS_API_KEY: "" },
  });
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stderr}\n${missing.stdout}`, /CENSUS_API_KEY/);
});

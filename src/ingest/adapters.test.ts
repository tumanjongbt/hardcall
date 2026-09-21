import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseApprenticeshipSponsors } from "./adapters/apprenticeship";
import { parseOewsTable1, highestPublishedWages } from "./adapters/bls";
import { parseOnetOccupations } from "./adapters/onet";
import { parseScorecardInstitutions, parseScorecardPrograms, median } from "./adapters/scorecard";
import { deriveFromInstitutions, deriveFromSponsors } from "./derive";
import { runIngest } from "./run";

const FIXTURES = path.resolve(process.cwd(), "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

const FETCHED = "2026-09-21T12:00:00.000Z";

test("apprenticeship adapter parses official CSV sample without PII fields", () => {
  const rows = parseApprenticeshipSponsors(readFixture("oa_partner_sponsors_sample.csv"), {
    source_url:
      "https://www.apprenticeship.gov/sites/default/files/wps/oa_partner_sponsors.csv",
    fetched_at: FETCHED,
  });
  assert.ok(rows.length >= 10, `got ${rows.length}`);
  for (const row of rows) {
    assert.equal(row.source, "apprenticeship_gov");
    assert.match(row.source_url, /^https:\/\/www\.apprenticeship\.gov\//);
    assert.equal(row.fetched_at, FETCHED);
    assert.ok(row.name.trim().length > 0);
    assert.equal((row as { email?: string }).email, undefined);
    assert.equal((row as { phone?: string }).phone, undefined);
  }
  assert.ok(rows.some((row) => row.name.includes("PRECISION WIRE")));
  const derived = deriveFromSponsors(rows);
  assert.ok(derived.insights.some((row) => row.source === "apprenticeship_gov"));
  assert.ok(derived.events.every((row) => row.source_url && row.fetched_at));
});

test("scorecard adapter parses official institution and CIP samples", () => {
  const institutions = parseScorecardInstitutions(
    readFixture("scorecard_institutions_sample.csv"),
    {
      source_url:
        "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip",
      fetched_at: FETCHED,
    }
  );
  assert.equal(institutions.length, 12);
  const aamu = institutions.find((row) => row.unitid === "100654");
  assert.ok(aamu);
  assert.equal(aamu?.name, "Alabama A & M University");
  assert.equal(aamu?.state, "AL");
  assert.equal(aamu?.control, "public");
  assert.equal(aamu?.tuition_in_state, 10024);
  assert.equal(aamu?.net_price, 17621);
  assert.equal(aamu?.source, "scorecard");
  const mid = median(institutions.map((row) => row.tuition_in_state));
  assert.ok(mid != null && mid > 0);

  const programs = parseScorecardPrograms(readFixture("scorecard_field_of_study_sample.csv"), {
    source_url:
      "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_06102026.zip",
    fetched_at: FETCHED,
  });
  assert.equal(programs.length, 12);
  const cs = programs.find((row) => row.cip_code === "1101");
  assert.equal(cs?.median_earnings, 60145);
  assert.equal(cs?.median_debt, 31000);
  const derived = deriveFromInstitutions(institutions);
  assert.match(derived.insights[0]?.value ?? "", /12/);
  assert.equal(derived.insights[0]?.source, "scorecard");
});

test("onet adapter parses Occupation Data CSV", () => {
  const rows = parseOnetOccupations(readFixture("onet_occupation_data_sample.csv"), {
    source_url: "https://www.onetcenter.org/dl_files/database/db_31_0_csv/occupation_data.csv",
    fetched_at: FETCHED,
  });
  assert.equal(rows.length, 20);
  assert.equal(rows[0]?.onet_soc, "11-1011.00");
  assert.equal(rows[0]?.title, "Chief Executives");
  assert.equal(rows[0]?.source, "onet");
  assert.ok((rows[0]?.description ?? "").length > 20);
});

test("bls adapter parses official OEWS Table 1 text without inventing annual medians", () => {
  const rows = parseOewsTable1(readFixture("bls_oes_table1_sample.txt"), {
    source_url: "https://www.bls.gov/news.release/ocwage.t01.htm",
    fetched_at: FETCHED,
  });
  const all = rows.find((row) => row.occupation_title === "All occupations");
  assert.ok(all);
  assert.equal(all?.employment, 155495730);
  assert.equal(all?.mean_annual_wage, 69770);
  assert.equal(all?.mean_hourly_wage, 33.54);
  assert.equal(all?.median_hourly_wage, 24.51);
  assert.equal(all?.median_annual_wage, null);
  const chiefs = rows.find((row) => row.occupation_title === "Chief executives");
  assert.equal(chiefs?.mean_annual_wage, 269630);
  const top = highestPublishedWages(rows, 3);
  assert.ok(top.length >= 1);
  assert.equal(top[0]?.occupation_title, "Chief executives");
});

test("dry-run ingest against local apprenticeship sample reports counts", async () => {
  const report = await runIngest({
    source: "apprenticeship_gov",
    file: path.join(FIXTURES, "oa_partner_sponsors_sample.csv"),
    dryRun: true,
  });
  assert.equal(report.dryRun, true);
  assert.equal(report.sources[0]?.source, "apprenticeship_gov");
  assert.ok((report.sources[0]?.rows ?? 0) >= 10);
  assert.ok(report.derivedInsights >= 1);
});

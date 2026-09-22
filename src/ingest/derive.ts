import { apprenticeshipStateCounts, type SponsorRecord } from "./adapters/apprenticeship";
import type { BeaObservation } from "./adapters/bea";
import { highestPublishedWages, type WageRecord } from "./adapters/bls";
import { fastestChanging, type ProjectionRecord } from "./adapters/bls_ep";
import {
  COS_ATTRIBUTION,
  type CertificationRecord,
  type LicenseRecord,
} from "./adapters/careeronestop";
import { unemploymentRate, type AcsPlace } from "./adapters/census";
import type { FredPoint } from "./adapters/fred";
import type { OccupationRecord } from "./adapters/onet";
import { median, type InstitutionRecord } from "./adapters/scorecard";
import type { CreateEvent, CreateInsight, EventSource, InsightSource } from "../types";

export type DerivedBundle = {
  events: Array<CreateEvent & { external_id: string }>;
  insights: CreateInsight[];
};

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function countFmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function clipTitle(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}...`;
}

function clipDetail(value: string): string {
  return value.length <= 8000 ? value : `${value.slice(0, 7997)}...`;
}

function clipDescription(value: string): string {
  return value.length <= 4000 ? value : `${value.slice(0, 3997)}...`;
}

function liveEvent(
  channel: CreateEvent["channel"],
  title: string,
  description: string,
  source: EventSource,
  source_url: string,
  fetched_at: string,
  external_id: string,
  tags: CreateEvent["tags"],
  emoji: string
): CreateEvent & { external_id: string } {
  return {
    channel,
    title: clipTitle(title),
    description: clipDescription(description),
    emoji,
    tags,
    source,
    source_url,
    fetched_at,
    external_id,
  };
}

function liveInsight(
  title: string,
  value: string,
  detail: string,
  source: InsightSource,
  source_url: string,
  fetched_at: string
): CreateInsight {
  return {
    title: clipTitle(title),
    value: value.trim().slice(0, 500),
    detail: clipDetail(detail),
    source,
    source_url,
    fetched_at,
  };
}

export function deriveFromSponsors(rows: SponsorRecord[]): DerivedBundle {
  if (rows.length === 0) return { events: [], insights: [] };
  const source_url = rows[0].source_url;
  const fetched_at = rows[0].fetched_at;
  const byState = apprenticeshipStateCounts(rows);
  const leader = byState[0];
  const top = byState.slice(0, 8)
    .map((row) => `${row.state} ${countFmt(row.count)}`)
    .join(", ");
  const events: DerivedBundle["events"] = [];
  if (leader) {
    events.push(
      liveEvent(
        "apprenticeship",
        `${leader.state} leads registered apprenticeship sponsors (${countFmt(leader.count)})`,
        `Counted ${countFmt(rows.length)} unique sponsors from the DOL OA Partner Sponsors extract. ${leader.state} has ${countFmt(leader.count)} of those rows. Top states: ${top}. Contact fields from the extract are not stored.`,
        "apprenticeship_gov",
        source_url,
        fetched_at,
        "apprenticeship_gov:density:leader",
        ["career_counselors", "workforce_training_managers", "parents"],
        "⚡"
      )
    );
  }
  const insights: CreateInsight[] = [
    liveInsight(
      "Registered apprenticeship sponsors (US)",
      countFmt(rows.length),
      `Unique sponsors in the official OA Partner Sponsors CSV (name+address+city+state). Fetched ${fetched_at}. Top states: ${top || "n/a"}. Source: ${source_url}`,
      "apprenticeship_gov",
      source_url,
      fetched_at
    ),
  ];
  if (leader) {
    insights.push(
      liveInsight(
        "Apprenticeship density leader",
        `${leader.state} · ${countFmt(leader.count)}`,
        `State with the most unique registered sponsors in this extract: ${leader.state} (${countFmt(leader.count)} of ${countFmt(rows.length)}). Not a job-opening count — sponsor directory rows only.`,
        "apprenticeship_gov",
        source_url,
        fetched_at
      )
    );
  }
  return { events, insights };
}

export function deriveFromInstitutions(rows: InstitutionRecord[]): DerivedBundle {
  if (rows.length === 0) return { events: [], insights: [] };
  const source_url = rows[0].source_url;
  const fetched_at = rows[0].fetched_at;
  const tuitionValues = rows.map((row) => row.tuition_in_state);
  const mid = median(tuitionValues);
  const withTuition = rows.filter((row) => row.tuition_in_state != null);
  const cheapest = [...withTuition].sort(
    (a, b) => (a.tuition_in_state ?? 0) - (b.tuition_in_state ?? 0)
  )[0];
  const dearest = [...withTuition].sort(
    (a, b) => (b.tuition_in_state ?? 0) - (a.tuition_in_state ?? 0)
  )[0];
  const events: DerivedBundle["events"] = [];
  if (mid != null) {
    events.push(
      liveEvent(
        "university",
        `Median in-state tuition among ${countFmt(withTuition.length)} Title IV schools is ${usd(Math.round(mid))}`,
        `College Scorecard most-recent institution file (institution / program cost of attendance, not per-course sticker). Operating schools in this ingest: ${countFmt(rows.length)}. Median uses published TUITIONFEE_IN only — suppressed/NA values are omitted, not imputed. Cheapest in-sample: ${cheapest?.name ?? "n/a"} ${cheapest?.tuition_in_state != null ? usd(cheapest.tuition_in_state) : ""}. Highest in-sample: ${dearest?.name ?? "n/a"} ${dearest?.tuition_in_state != null ? usd(dearest.tuition_in_state) : ""}.`,
        "scorecard",
        source_url,
        fetched_at,
        "scorecard:tuition:median",
        ["parents", "college_students", "career_counselors"],
        "🎓"
      )
    );
  }
  const insights: CreateInsight[] = [
    liveInsight(
      "Title IV institutions (Scorecard)",
      countFmt(rows.length),
      `Operating institutions parsed from the College Scorecard most-recent institution file. Fetched ${fetched_at}. ${source_url}`,
      "scorecard",
      source_url,
      fetched_at
    ),
  ];
  if (mid != null) {
    insights.push(
      liveInsight(
        "Median in-state tuition (operating Title IV)",
        usd(Math.round(mid)),
        `Median of published in-state tuition (TUITIONFEE_IN) across ${countFmt(withTuition.length)} schools with a numeric value. Institution / program cost of attendance from College Scorecard — not a per-course catalog (no national per-section price API exists).`,
        "scorecard",
        source_url,
        fetched_at
      )
    );
  }
  return { events, insights };
}

export function deriveFromOccupations(rows: OccupationRecord[]): DerivedBundle {
  if (rows.length === 0) return { events: [], insights: [] };
  const source_url = rows[0].source_url;
  const fetched_at = rows[0].fetched_at;
  return {
    events: [
      liveEvent(
        "trade",
        `O*NET catalog lists ${countFmt(rows.length)} occupations`,
        `Parsed from the downloadable O*NET Occupation Data file (O*NET-SOC code, title, description). This page includes information from the O*NET Database by the U.S. Department of Labor, Employment and Training Administration. Used under the CC BY 4.0 license. O*NET® is a trademark of USDOL/ETA.`,
        "onet",
        source_url,
        fetched_at,
        "onet:occupations:count",
        ["career_counselors", "workforce_training_managers"],
        "🧭"
      ),
    ],
    insights: [
      liveInsight(
        "O*NET occupations in catalog",
        countFmt(rows.length),
        `Count of O*NET-SOC rows in the Occupation Data download. Source: ${source_url}. Includes information from the O*NET Database by USDOL/ETA, CC BY 4.0. O*NET® is a trademark of USDOL/ETA.`,
        "onet",
        source_url,
        fetched_at
      ),
    ],
  };
}

export function deriveFromWages(rows: WageRecord[]): DerivedBundle {
  if (rows.length === 0) return { events: [], insights: [] };
  const source_url = rows[0].source_url;
  const fetched_at = rows[0].fetched_at;
  const period = rows[0].period;
  const all = rows.find((row) => row.occupation_title.toLowerCase() === "all occupations");
  const top = highestPublishedWages(rows, 5);
  const topLine = top
    .map((row) => {
      const wage = row.median_annual_wage ?? row.mean_annual_wage;
      return wage != null ? `${row.occupation_title} ${usd(wage)}` : row.occupation_title;
    })
    .join("; ");
  const events: DerivedBundle["events"] = [];
  if (all?.mean_annual_wage != null) {
    events.push(
      liveEvent(
        "trade",
        `OEWS ${period} mean annual wage for all occupations is ${usd(all.mean_annual_wage)}`,
        `BLS Occupational Employment and Wage Statistics, ${period}, national. Employment ${all.employment != null ? countFmt(all.employment) : "n/a"}. Mean hourly ${all.mean_hourly_wage ?? "n/a"}; median hourly ${all.median_hourly_wage ?? "n/a"}. OEWS is a survey release, not a tick stream. Highest detailed occupations in this extract (published mean or median annual): ${topLine || "n/a"}.`,
        "bls",
        source_url,
        fetched_at,
        "bls:oes:all-occupations",
        ["career_counselors", "parents", "workforce_training_managers"],
        "💵"
      )
    );
  }
  const insights: CreateInsight[] = [];
  if (all?.mean_annual_wage != null) {
    insights.push(
      liveInsight(
        `National mean annual wage (OEWS ${period})`,
        usd(all.mean_annual_wage),
        `All-occupations mean annual wage from BLS OEWS ${period}. Employment ${all.employment != null ? countFmt(all.employment) : "n/a"}. Source: ${source_url}`,
        "bls",
        source_url,
        fetched_at
      )
    );
  }
  if (top[0]) {
    const wage = top[0].median_annual_wage ?? top[0].mean_annual_wage;
    insights.push(
      liveInsight(
        "Highest published occupational wage in extract",
        wage != null ? `${top[0].occupation_title} · ${usd(wage)}` : top[0].occupation_title,
        `Detailed occupations only (major groups excluded). Uses published median annual when the file has A_MEDIAN; otherwise published mean annual from Table 1. Not a growth projection. Top 5: ${topLine}`,
        "bls",
        source_url,
        fetched_at
      )
    );
  }
  return { events, insights };
}

function signedPct(n: number): string {
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(n));
  if (n > 0) return `+${body}%`;
  if (n < 0) return `-${body}%`;
  return `${body}%`;
}

export function deriveFromProjections(rows: ProjectionRecord[]): DerivedBundle {
  if (rows.length === 0) return { events: [], insights: [] };
  const source_url = rows[0].source_url;
  const fetched_at = rows[0].fetched_at;
  const period = rows[0].period;
  const total = rows.find((row) => /^total,\s*all occupations$/i.test(row.occupation_title));
  const growing = fastestChanging(rows, "grow");
  const declining = fastestChanging(rows, "decline");
  const events: DerivedBundle["events"] = [];
  const insights: CreateInsight[] = [];
  if (total?.change_percent != null) {
    events.push(
      liveEvent(
        "trade",
        `Employment projected ${signedPct(total.change_percent)} for all occupations, ${period}`,
        `BLS Employment Projections Table 1.2, ${period}. Employment is published in thousands and stored here as persons (base ${total.employment_base != null ? countFmt(total.employment_base) : "n/a"}, projected ${total.employment_proj != null ? countFmt(total.employment_proj) : "n/a"}). Annual openings ${total.annual_openings != null ? countFmt(total.annual_openings) : "n/a"}. National SOC outlook, not a job-posting feed.`,
        "bls_ep",
        source_url,
        fetched_at,
        "bls_ep:total",
        ["career_counselors", "parents", "workforce_training_managers"],
        "📈"
      )
    );
    insights.push(
      liveInsight(
        `Projected employment change, all occupations (EP ${period})`,
        signedPct(total.change_percent),
        `BLS Employment Projections national total, ${period}. Published percent change. Employment base ${total.employment_base != null ? countFmt(total.employment_base) : "n/a"} persons (table is in thousands). ${source_url}`,
        "bls_ep",
        source_url,
        fetched_at
      )
    );
  }
  if (total?.annual_openings != null) {
    insights.push(
      liveInsight(
        `Projected annual openings, all occupations (EP ${period})`,
        countFmt(total.annual_openings),
        `Occupational openings, annual average, from BLS Table 1.2. Published in thousands; stored as persons. ${period}.`,
        "bls_ep",
        source_url,
        fetched_at
      )
    );
  }
  if (growing?.change_percent != null) {
    events.push(
      liveEvent(
        "trade",
        `${growing.occupation_title} projected employment ${signedPct(growing.change_percent)} (${period})`,
        `Fastest percent increase among detailed occupations in this Employment Projections extract (line items only; major-group summaries excluded). ${growing.soc_code ?? "SOC n/a"}. Typical education: ${growing.typical_education ?? "n/a"}. Annual openings ${growing.annual_openings != null ? countFmt(growing.annual_openings) : "n/a"}. Median annual wage ${growing.median_annual_wage != null ? usd(growing.median_annual_wage) : "n/a"}.`,
        "bls_ep",
        source_url,
        fetched_at,
        "bls_ep:fastest-growing",
        ["college_students", "career_counselors", "workforce_training_managers"],
        "📈"
      )
    );
    insights.push(
      liveInsight(
        `Fastest growing occupation (EP ${period})`,
        `${growing.occupation_title} · ${signedPct(growing.change_percent)}`,
        `Detailed occupation with the largest published percent employment change in this Table 1.2 extract. ${growing.soc_code ?? ""}. Education: ${growing.typical_education ?? "n/a"}.`,
        "bls_ep",
        source_url,
        fetched_at
      )
    );
  }
  if (declining?.change_percent != null) {
    events.push(
      liveEvent(
        "automation",
        `${declining.occupation_title} projected employment ${signedPct(declining.change_percent)} (${period})`,
        `Largest published percent decline among detailed occupations in this Employment Projections extract. ${declining.soc_code ?? "SOC n/a"}. Typical education: ${declining.typical_education ?? "n/a"}. Annual openings ${declining.annual_openings != null ? countFmt(declining.annual_openings) : "n/a"}.`,
        "bls_ep",
        source_url,
        fetched_at,
        "bls_ep:fastest-declining",
        ["career_counselors", "workforce_training_managers", "parents"],
        "📉"
      )
    );
    insights.push(
      liveInsight(
        `Fastest declining occupation (EP ${period})`,
        `${declining.occupation_title} · ${signedPct(declining.change_percent)}`,
        `Detailed occupation with the most negative published percent employment change in this Table 1.2 extract. ${declining.soc_code ?? ""}.`,
        "bls_ep",
        source_url,
        fetched_at
      )
    );
  }
  return { events, insights };
}

function slugState(state: string): string {
  return state.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "us";
}

export function deriveFromCareerOneStop(input: {
  licenses: LicenseRecord[];
  certifications: CertificationRecord[];
  wages: WageRecord[];
  license_reported: number | null;
  certification_reported: number | null;
}): DerivedBundle {
  const events: DerivedBundle["events"] = [];
  const insights: CreateInsight[] = [];
  if (input.licenses.length > 0) {
    const sample = input.licenses[0];
    const byState = new Map<string, number>();
    for (const row of input.licenses) {
      const state = row.state || "United States";
      byState.set(state, (byState.get(state) ?? 0) + 1);
    }
    const states = [...byState.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const reported = input.license_reported ?? input.licenses.length;
    insights.push(
      liveInsight(
        "Occupational licenses (CareerOneStop)",
        countFmt(input.licenses.length),
        `Fetched ${countFmt(input.licenses.length)} of ${countFmt(reported)} licenses from the CareerOneStop List Licenses API. Each license is attributed to ${COS_ATTRIBUTION} Bing geocodes are not stored. States in this extract: ${states.map(([state, count]) => `${state} ${countFmt(count)}`).join(", ")}.`,
        "careeronestop",
        sample.source_url,
        sample.fetched_at
      )
    );
    for (const [state, count] of states) {
      events.push(
        liveEvent(
          "trade",
          `${state}: ${countFmt(count)} occupational licenses in this CareerOneStop extract`,
          `License rows for ${state} returned by CareerOneStop. Attribution: ${COS_ATTRIBUTION} This is the fetched page, not necessarily every license in the state when a record cap is set. Bing geocodes are not stored.`,
          "careeronestop",
          sample.source_url,
          sample.fetched_at,
          `careeronestop:license-state:${slugState(state)}`,
          ["career_counselors", "workforce_training_managers", "parents"],
          "🪪"
        )
      );
    }
  }
  if (input.certifications.length > 0) {
    const sample = input.certifications[0];
    const reported = input.certification_reported ?? input.certifications.length;
    const names = input.certifications
      .slice(0, 5)
      .map((row) => row.name)
      .join("; ");
    insights.push(
      liveInsight(
        "Certifications (CareerOneStop)",
        countFmt(input.certifications.length),
        `Fetched ${countFmt(input.certifications.length)} of ${countFmt(reported)} certifications. Examples: ${names}. Attribution: ${COS_ATTRIBUTION} Credential Engine's CTDL registry needs a separate account and is not ingested; these CareerOneStop certifications are the production credential list.`,
        "careeronestop",
        sample.source_url,
        sample.fetched_at
      )
    );
    events.push(
      liveEvent(
        "trade",
        `CareerOneStop certifications in this extract: ${countFmt(input.certifications.length)}`,
        `Certification finder results. Examples: ${names}. Attribution: ${COS_ATTRIBUTION}`,
        "careeronestop",
        sample.source_url,
        sample.fetched_at,
        "careeronestop:certifications",
        ["college_students", "career_counselors", "workforce_training_managers"],
        "📜"
      )
    );
  }
  const national = input.wages.find((row) => row.area_type === "national" && row.median_annual_wage != null);
  if (national?.median_annual_wage != null) {
    insights.push(
      liveInsight(
        `National median wage — ${national.occupation_title} (CareerOneStop)`,
        usd(national.median_annual_wage),
        `Optional wage compare, national annual median, period ${national.period}. ${national.median_hourly_wage != null ? `Hourly median ${national.median_hourly_wage}. ` : ""}Wages are OEWS via CareerOneStop. Attribution: ${COS_ATTRIBUTION} Metro Bing geocodes are not requested or stored.`,
        "careeronestop",
        national.source_url,
        national.fetched_at
      )
    );
  }
  return { events, insights };
}

export function deriveFromAcs(places: AcsPlace[]): DerivedBundle {
  if (places.length === 0) return { events: [], insights: [] };
  const source_url = places[0].source_url;
  const fetched_at = places[0].fetched_at;
  const year = places[0].year;
  const nation = places.find((row) => row.geo_id === "US" || row.name === "United States");
  const states = places.filter((row) => row !== nation && row.median_household_income != null);
  const richest = [...states].sort(
    (a, b) => (b.median_household_income ?? 0) - (a.median_household_income ?? 0)
  )[0];
  const events: DerivedBundle["events"] = [];
  const insights: CreateInsight[] = [];
  if (nation?.median_household_income != null) {
    insights.push(
      liveInsight(
        `Median household income (ACS 5-year ${year})`,
        usd(nation.median_household_income),
        `United States, ACS 5-year detailed table B19013_001E. Not an occupation wage. ${source_url}`,
        "census",
        source_url,
        fetched_at
      )
    );
  }
  if (nation) {
    const rate = unemploymentRate(nation);
    if (rate != null) {
      insights.push(
        liveInsight(
          `Unemployment rate (ACS 5-year ${year})`,
          signedPct(rate).replace(/^\+/, ""),
          `United States. Computed as B23025_005E (unemployed) / B23025_003E (civilian labor force), the Census unemployment-rate definition, from published counts ${countFmt(nation.unemployed ?? 0)} / ${countFmt(nation.civilian_labor_force ?? 0)}. Not a BLS monthly rate.`,
          "census",
          source_url,
          fetched_at
        )
      );
    }
  }
  if (richest?.median_household_income != null) {
    events.push(
      liveEvent(
        "trade",
        `${richest.name} has the highest median household income in this ACS extract (${usd(richest.median_household_income)})`,
        `ACS 5-year ${year} B19013_001E among states returned in this ingest. State context, not an occupation wage. ${source_url}`,
        "census",
        source_url,
        fetched_at,
        "census:income:leader",
        ["parents", "career_counselors"],
        "🗺️"
      )
    );
  }
  return { events, insights };
}

function beaDisplay(row: BeaObservation): string {
  if (row.value == null) return "n/a";
  if (row.unit && /dollar/i.test(row.unit) && !/million/i.test(row.unit)) return usd(row.value);
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(row.value);
  return row.unit ? `${formatted} (${row.unit})` : formatted;
}

export function deriveFromBea(input: { gdp: BeaObservation[]; income: BeaObservation[] }): DerivedBundle {
  const events: DerivedBundle["events"] = [];
  const insights: CreateInsight[] = [];
  const incomeNation = input.income.find((row) => row.geo_fips === "00000" || row.geo_name === "United States");
  const incomeStates = input.income.filter((row) => row !== incomeNation && row.value != null);
  const incomeLeader = [...incomeStates].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  if (incomeNation?.value != null) {
    insights.push(
      liveInsight(
        `Per capita personal income (BEA ${incomeNation.table} ${incomeNation.time_period})`,
        beaDisplay(incomeNation),
        `United States, BEA Regional ${incomeNation.table} line ${incomeNation.line_code ?? ""}. ${incomeNation.unit ?? "Published units"}. BEA regions (for example Far West) are excluded. ${incomeNation.source_url}`,
        "bea",
        incomeNation.source_url,
        incomeNation.fetched_at
      )
    );
  }
  if (incomeLeader?.value != null) {
    events.push(
      liveEvent(
        "trade",
        `${incomeLeader.geo_name} leads this BEA per capita income extract (${beaDisplay(incomeLeader)})`,
        `Highest state or DC value in BEA ${incomeLeader.table} for ${incomeLeader.time_period}. Regional aggregates are not included. ${incomeLeader.source_url}`,
        "bea",
        incomeLeader.source_url,
        incomeLeader.fetched_at,
        "bea:income:leader",
        ["career_counselors", "parents"],
        "🏦"
      )
    );
  }
  const gdpNation = input.gdp.find((row) => row.geo_fips === "00000" || row.geo_name === "United States");
  if (gdpNation?.value != null) {
    insights.push(
      liveInsight(
        `GDP (BEA ${gdpNation.table} ${gdpNation.time_period})`,
        beaDisplay(gdpNation),
        `United States all-industry total from BEA Regional ${gdpNation.table} line ${gdpNation.line_code ?? ""}. Value is the published DataValue (${gdpNation.unit ?? "see CL_UNIT"}). ${gdpNation.source_url}`,
        "bea",
        gdpNation.source_url,
        gdpNation.fetched_at
      )
    );
  }
  return { events, insights };
}

export function deriveFromFred(points: FredPoint[]): DerivedBundle {
  if (points.length === 0) return { events: [], insights: [] };
  const insights = points.map((point) =>
    liveInsight(
      `${point.title} (FRED ${point.series_id})`,
      point.unit === "percent" ? `${point.value}% (${point.date})` : `${point.value} (${point.date})`,
      `Latest observation returned for ${point.series_id}. Units: ${point.unit}. Macro context, not an occupation wage. ${point.source_url}`,
      "fred",
      point.source_url,
      point.fetched_at
    )
  );
  const first = points[0];
  const summary = points
    .map((point) => `${point.series_id} ${point.value} (${point.date})`)
    .join("; ");
  return {
    events: [
      liveEvent(
        "trade",
        `FRED macro snapshot: ${summary}`,
        `St. Louis Fed FRED series pulled for economic context. ${summary}. ${first.source_url}`,
        "fred",
        first.source_url,
        first.fetched_at,
        "fred:macro",
        ["career_counselors", "parents"],
        "📊"
      ),
    ],
    insights,
  };
}

export function mergeDerived(bundles: DerivedBundle[]): DerivedBundle {
  return {
    events: bundles.flatMap((bundle) => bundle.events),
    insights: bundles.flatMap((bundle) => bundle.insights),
  };
}

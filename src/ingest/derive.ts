import { apprenticeshipStateCounts, type SponsorRecord } from "./adapters/apprenticeship";
import { highestPublishedWages, type WageRecord } from "./adapters/bls";
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
    description: clipDetail(description),
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

export function mergeDerived(bundles: DerivedBundle[]): DerivedBundle {
  return {
    events: bundles.flatMap((bundle) => bundle.events),
    insights: bundles.flatMap((bundle) => bundle.insights),
  };
}

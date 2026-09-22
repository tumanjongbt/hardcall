import { cell, parseCsv, parseNumber } from "../csv";

export type BlsProvenance = {
  source: "bls";
  source_url: string;
  fetched_at: string;
};

export type WageRecord = {
  soc_code: string | null;
  occupation_title: string;
  area_code: string;
  area_name: string;
  area_type: "national" | "state";
  period: string;
  employment: number | null;
  mean_annual_wage: number | null;
  median_annual_wage: number | null;
  mean_hourly_wage: number | null;
  median_hourly_wage: number | null;
  source: "bls" | "careeronestop";
  source_url: string;
  fetched_at: string;
};

const TITLE_STOP = new Set([
  "occupation",
  "occupations",
  "employment",
  "mean wages",
  "hourly",
  "annual",
  "median",
  "median hourly",
]);

function cleanTitle(raw: string): string {
  return raw.replace(/\.+$/, "").replace(/\s+/g, " ").trim();
}

function looksLikeHeader(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_STOP.has(lower) || lower.includes("mean wages") || lower.startsWith("table 1");
}

/**
 * Parse BLS OEWS Table 1 fixed-width / dotted news-release text.
 * Numbers are taken from the official table; missing (2) footnotes become null.
 */
export function parseOewsTable1(
  text: string,
  provenance: Omit<BlsProvenance, "source">,
  opts?: { limit?: number; period?: string }
): WageRecord[] {
  const period = opts?.period ?? "May 2025";
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const out: WageRecord[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\u00a0/g, " ").replace(/\t+/g, " ");
    if (!line.trim()) continue;
    const dotted = line.match(
      /^(.*?)\.{2,}\s+([\d,]+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/
    );
    const spaced = dotted
      ? null
      : line.match(
          /^(All occupations|.+occupations)\s{2,}([\d,]+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/i
        );
    const m = dotted ?? spaced;
    if (!m) continue;
    const title = cleanTitle(m[1] ?? "");
    if (!title || looksLikeHeader(title)) continue;
    const employment = parseNumber(m[2]);
    const meanHourly = parseNumber(m[3]);
    const meanAnnual = parseNumber(m[4]);
    const medianHourly = parseNumber(m[5]);
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      soc_code: null,
      occupation_title: title,
      area_code: "US",
      area_name: "United States",
      area_type: "national",
      period,
      employment,
      mean_annual_wage: meanAnnual,
      median_annual_wage: null,
      mean_hourly_wage: meanHourly,
      median_hourly_wage: medianHourly,
      source: "bls",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Parse national/state OEWS CSV or TSV with OCC_TITLE / TOT_EMP / A_MEAN / A_MEDIAN columns. */
export function parseOewsSpreadsheet(
  text: string,
  provenance: Omit<BlsProvenance, "source">,
  opts?: { limit?: number; period?: string; areaType?: "national" | "state" }
): WageRecord[] {
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  const rows = parseCsv(text, delimiter);
  const period = opts?.period ?? "May 2025";
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const out: WageRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const title = cell(row, "OCC_TITLE", "occupation_title", "Occupation", "occupation");
    if (!title) continue;
    const areaCode = cell(row, "AREA", "area_code") || "US";
    const areaName = cell(row, "AREA_TITLE", "area_name") || "United States";
    const areaType =
      opts?.areaType ??
      (areaCode === "US" || areaName.toLowerCase().includes("united states")
        ? "national"
        : "state");
    const key = `${title.toLowerCase()}|${areaCode}|${period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      soc_code: cell(row, "OCC_CODE", "soc_code") || null,
      occupation_title: title,
      area_code: areaCode,
      area_name: areaName,
      area_type: areaType,
      period,
      employment: parseNumber(cell(row, "TOT_EMP", "employment")),
      mean_annual_wage: parseNumber(cell(row, "A_MEAN", "mean_annual_wage")),
      median_annual_wage: parseNumber(cell(row, "A_MEDIAN", "median_annual_wage")),
      mean_hourly_wage: parseNumber(cell(row, "H_MEAN", "mean_hourly_wage")),
      median_hourly_wage: parseNumber(cell(row, "H_MEDIAN", "median_hourly_wage")),
      source: "bls",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function parseOewsAuto(
  text: string,
  provenance: Omit<BlsProvenance, "source">,
  opts?: { limit?: number; period?: string }
): WageRecord[] {
  const sample = text.slice(0, 800).toLowerCase();
  if (sample.includes("occ_title") || sample.includes("tot_emp") || sample.includes("a_median")) {
    return parseOewsSpreadsheet(text, provenance, opts);
  }
  return parseOewsTable1(text, provenance, opts);
}

/** Rank by published wage: median annual if present, else mean annual. Never interpolate. */
export function highestPublishedWages(rows: WageRecord[], n = 5): WageRecord[] {
  const wage = (row: WageRecord): number | null =>
    row.median_annual_wage ?? row.mean_annual_wage;
  return rows
    .filter(
      (row) =>
        wage(row) != null &&
        !/occupations$/i.test(row.occupation_title) &&
        row.occupation_title.toLowerCase() !== "all occupations"
    )
    .sort((a, b) => (wage(b) ?? 0) - (wage(a) ?? 0))
    .slice(0, n);
}

import { CREDENTIAL_HELP } from "../credentials";
import { parseNumber } from "../csv";
import { fetchJson } from "../fetch_feed";
import { CENSUS_ACS5_DOCS } from "../urls";

/** ACS detailed-table variables. Unemployment rate is B23025_005E / B23025_003E (Census definition). */
export const ACS_VARIABLES = [
  "NAME",
  "B19013_001E",
  "B19301_001E",
  "B23025_003E",
  "B23025_005E",
  "B01003_001E",
] as const;

export type AcsPlace = {
  name: string;
  geo_id: string;
  median_household_income: number | null;
  per_capita_income: number | null;
  civilian_labor_force: number | null;
  unemployed: number | null;
  population: number | null;
  year: string;
  source: "census";
  source_url: string;
  fetched_at: string;
};

export type AcsExtract = {
  year: string;
  places: AcsPlace[];
  source_url: string;
};

function censusNumber(raw: string): number | null {
  const n = parseNumber(raw);
  if (n == null) return null;
  if (n <= -999999) return null;
  return n;
}

export function acsSourceUrl(year: string, geo: "state:*" | "us:1"): string {
  const params = new URLSearchParams({
    get: ACS_VARIABLES.join(","),
    for: geo,
  });
  return `https://api.census.gov/data/${year}/acs/acs5?${params.toString()}`;
}

export function parseAcsTable(
  payload: unknown,
  year: string,
  provenance: { source_url: string; fetched_at: string }
): AcsPlace[] {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) return [];
  const header = (payload[0] as unknown[]).map((cell) => String(cell));
  const index = new Map<string, number>(header.map((name, i) => [name, i]));
  const at = (row: unknown[], name: string): string => {
    const idx = index.get(name);
    if (idx == null) return "";
    return String(row[idx] ?? "").trim();
  };
  const out: AcsPlace[] = [];
  for (const raw of payload.slice(1)) {
    if (!Array.isArray(raw)) continue;
    const name = at(raw, "NAME");
    if (!name) continue;
    const state = at(raw, "state");
    const us = at(raw, "us");
    const geo_id = state ? state : us ? "US" : "US";
    out.push({
      name,
      geo_id,
      median_household_income: censusNumber(at(raw, "B19013_001E")),
      per_capita_income: censusNumber(at(raw, "B19301_001E")),
      civilian_labor_force: censusNumber(at(raw, "B23025_003E")),
      unemployed: censusNumber(at(raw, "B23025_005E")),
      population: censusNumber(at(raw, "B01003_001E")),
      year,
      source: "census",
      source_url: provenance.source_url,
      fetched_at: provenance.fetched_at,
    });
  }
  return out;
}

export function unemploymentRate(place: AcsPlace): number | null {
  if (place.civilian_labor_force == null || place.unemployed == null) return null;
  if (place.civilian_labor_force <= 0) return null;
  return (place.unemployed / place.civilian_labor_force) * 100;
}

function yearsToTry(env: NodeJS.ProcessEnv): string[] {
  const preferred = env.CENSUS_ACS_YEAR?.trim();
  const list = [preferred, "2024", "2023"].filter((year): year is string => Boolean(year));
  return [...new Set(list)];
}

class CensusYearUnavailable extends Error {}

async function fetchTable(year: string, geo: "state:*" | "us:1", key: string): Promise<unknown> {
  const url = `${acsSourceUrl(year, geo)}&key=${encodeURIComponent(key)}`;
  try {
    const body = await fetchJson(url);
    if (!Array.isArray(body)) {
      const message = JSON.stringify(body).slice(0, 180);
      if (/unknown|not found|error/i.test(message)) throw new CensusYearUnavailable(message);
      throw new Error(`census_unexpected_body:${year}:${geo}`);
    }
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof CensusYearUnavailable) throw err;
    if (/fetch_failed:404|fetch_not_json:404|unknown variable|unknown dataset/i.test(message)) {
      throw new CensusYearUnavailable(message);
    }
    throw err;
  }
}

export async function fetchAcs(env: NodeJS.ProcessEnv, fetchedAt: string): Promise<AcsExtract> {
  const key = env.CENSUS_API_KEY?.trim();
  if (!key) throw new Error(`census: ${CREDENTIAL_HELP.census}`);
  let last: Error | null = null;
  for (const year of yearsToTry(env)) {
    try {
      const states = await fetchTable(year, "state:*", key);
      const nation = await fetchTable(year, "us:1", key);
      const source_url = acsSourceUrl(year, "state:*");
      const places = [
        ...parseAcsTable(nation, year, { source_url, fetched_at: fetchedAt }),
        ...parseAcsTable(states, year, { source_url, fetched_at: fetchedAt }),
      ];
      if (places.length === 0) throw new CensusYearUnavailable(`census_empty:${year}`);
      return { year, places, source_url };
    } catch (err) {
      if (err instanceof CensusYearUnavailable) {
        last = err;
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `census: no ACS 5-year table for ${yearsToTry(env).join(", ")} (${last?.message ?? "empty"}). Set CENSUS_ACS_YEAR. Docs: ${CENSUS_ACS5_DOCS}`
  );
}

export function parseAcsFile(payload: unknown, fetchedAt: string): AcsExtract {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const year = typeof root?.year === "string" && root.year.trim() ? root.year.trim() : "2023";
  const source_url = acsSourceUrl(year, "state:*");
  const provenance = { source_url, fetched_at: fetchedAt };
  if (Array.isArray(payload)) {
    return { year, source_url, places: parseAcsTable(payload, year, provenance) };
  }
  const states = parseAcsTable(root?.states, year, provenance);
  const nation = parseAcsTable(root?.nation, year, provenance);
  return { year, source_url, places: [...nation, ...states] };
}

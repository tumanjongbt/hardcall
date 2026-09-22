import { CREDENTIAL_HELP } from "../credentials";
import { fetchJson } from "../fetch_feed";
import { FRED_SERIES_DOCS } from "../urls";

export type FredSeries = {
  id: string;
  title: string;
  unit: string;
  source_url: string;
};

export const FRED_CATALOG: FredSeries[] = [
  {
    id: "UNRATE",
    title: "Civilian unemployment rate",
    unit: "percent",
    source_url: "https://fred.stlouisfed.org/series/UNRATE",
  },
  {
    id: "CPIAUCSL",
    title: "CPI-U all items",
    unit: "index 1982-84=100",
    source_url: "https://fred.stlouisfed.org/series/CPIAUCSL",
  },
];

export type FredPoint = {
  series_id: string;
  title: string;
  unit: string;
  date: string;
  value: number;
  source: "fred";
  source_url: string;
  fetched_at: string;
};

export function fredSeriesList(env: NodeJS.ProcessEnv): FredSeries[] {
  const raw = env.FRED_SERIES?.trim();
  if (!raw) return FRED_CATALOG;
  const ids = raw.split(",").map((id) => id.trim()).filter((id) => /^[A-Za-z0-9]+$/.test(id));
  if (ids.length === 0) return FRED_CATALOG;
  return ids.map((id) => {
    const known = FRED_CATALOG.find((row) => row.id === id);
    return (
      known ?? {
        id,
        title: `FRED ${id}`,
        unit: "published units",
        source_url: `https://fred.stlouisfed.org/series/${id}`,
      }
    );
  });
}

/** First finite observation. FRED uses "." for missing. */
export function parseFredObservations(
  payload: unknown,
  series: FredSeries,
  fetchedAt: string
): FredPoint | null {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const observations = root?.observations;
  if (!Array.isArray(observations)) {
    const error = root?.error_message;
    if (typeof error === "string" && error.trim()) throw new Error(`fred_api:${error}`);
    throw new Error(`fred_unexpected_body:${series.id}`);
  }
  for (const item of observations) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = String(row.date ?? "").trim();
    const raw = String(row.value ?? "").trim();
    if (!date || raw === "." || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    return {
      series_id: series.id,
      title: series.title,
      unit: series.unit,
      date,
      value,
      source: "fred",
      source_url: series.source_url,
      fetched_at: fetchedAt,
    };
  }
  return null;
}

export async function fetchFred(env: NodeJS.ProcessEnv, fetchedAt: string): Promise<FredPoint[]> {
  const key = env.FRED_API_KEY?.trim();
  if (!key) throw new Error(`fred: ${CREDENTIAL_HELP.fred}`);
  const points: FredPoint[] = [];
  for (const series of fredSeriesList(env)) {
    const params = new URLSearchParams({
      series_id: series.id,
      api_key: key,
      file_type: "json",
      sort_order: "desc",
      limit: "1",
    });
    const body = await fetchJson(
      `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`
    );
    const point = parseFredObservations(body, series, fetchedAt);
    if (point) points.push(point);
  }
  if (points.length === 0) {
    throw new Error(`fred: observations empty. Docs: ${FRED_SERIES_DOCS}`);
  }
  return points;
}

export function parseFredFile(payload: unknown, fetchedAt: string): FredPoint[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  if (!root) return [];
  const points: FredPoint[] = [];
  for (const series of FRED_CATALOG) {
    if (!(series.id in root)) continue;
    const point = parseFredObservations(root[series.id], series, fetchedAt);
    if (point) points.push(point);
  }
  return points;
}

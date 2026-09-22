import { CREDENTIAL_HELP } from "../credentials";
import { parseNumber } from "../csv";
import { fetchJson } from "../fetch_feed";
import { BEA_API_DOCS } from "../urls";

/** State and DC FIPS prefixes, plus territories BEA sometimes includes. */
const GEO_PREFIX = new Set([
  "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18", "19",
  "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35",
  "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53",
  "54", "55", "56", "60", "66", "69", "72", "78",
]);

export type BeaObservation = {
  table: string;
  line_code: string | null;
  geo_fips: string;
  geo_name: string;
  time_period: string;
  value: number | null;
  unit: string | null;
  source: "bea";
  source_url: string;
  fetched_at: string;
};

export type BeaExtract = {
  gdp: BeaObservation[];
  income: BeaObservation[];
  source_url: string;
};

function cleanGeoName(name: string): string {
  return name.replace(/\s*\*+\s*$/g, "").replace(/\s+/g, " ").trim();
}

export function isStateOrNation(geoFips: string, geoName: string): boolean {
  if (geoFips === "00000" || /^united states$/i.test(cleanGeoName(geoName))) return true;
  if (!/^\d{5}$/.test(geoFips) || !geoFips.endsWith("000")) return false;
  return GEO_PREFIX.has(geoFips.slice(0, 2));
}

export function beaSourceUrl(table: string, line: string): string {
  const params = new URLSearchParams({
    method: "GetData",
    datasetname: "Regional",
    TableName: table,
    LineCode: line,
    GeoFIPS: "STATE",
    Year: "LAST1",
    ResultFormat: "JSON",
  });
  return `https://apps.bea.gov/api/data/?${params.toString()}`;
}

export function parseBeaData(
  payload: unknown,
  meta: { table: string; line: string; source_url: string; fetched_at: string }
): BeaObservation[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const bea = root?.BEAAPI && typeof root.BEAAPI === "object" ? (root.BEAAPI as Record<string, unknown>) : root;
  const results =
    bea?.Results && typeof bea.Results === "object" ? (bea.Results as Record<string, unknown>) : null;
  if (!results) return [];
  const error = results.Error;
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    const description = String(rec.APIErrorDescription ?? rec.ErrorDetail ?? "BEA request failed");
    throw new Error(`bea_api:${description}`);
  }
  const data = results.Data;
  if (!Array.isArray(data)) return [];
  const rows: BeaObservation[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const geoFips = String(row.GeoFips ?? row.GeoFIPS ?? "").trim();
    const geoName = cleanGeoName(String(row.GeoName ?? ""));
    if (!geoName || !isStateOrNation(geoFips, geoName)) continue;
    const value = parseNumber(String(row.DataValue ?? ""));
    if (value == null) continue;
    rows.push({
      table: meta.table,
      line_code: meta.line,
      geo_fips: geoFips || (geoName.toLowerCase() === "united states" ? "00000" : ""),
      geo_name: geoName,
      time_period: String(row.TimePeriod ?? "").trim(),
      value,
      unit: String(row.CL_UNIT ?? "").trim() || null,
      source: "bea",
      source_url: meta.source_url,
      fetched_at: meta.fetched_at,
    });
  }
  if (rows.length === 0) return [];
  const latest = rows.map((row) => row.time_period).filter(Boolean).sort().at(-1) ?? "";
  return latest ? rows.filter((row) => row.time_period === latest) : rows;
}

async function fetchTable(
  userId: string,
  table: string,
  line: string,
  fetchedAt: string
): Promise<BeaObservation[]> {
  const source_url = beaSourceUrl(table, line);
  const url = `${source_url}&UserID=${encodeURIComponent(userId)}`;
  const body = await fetchJson(url);
  return parseBeaData(body, { table, line, source_url, fetched_at: fetchedAt });
}

export async function fetchBea(env: NodeJS.ProcessEnv, fetchedAt: string): Promise<BeaExtract> {
  const userId = env.BEA_API_KEY?.trim();
  if (!userId) throw new Error(`bea: ${CREDENTIAL_HELP.bea}`);
  const gdpTable = env.BEA_GDP_TABLE?.trim() || "SAGDP2N";
  const gdpLine = env.BEA_GDP_LINE?.trim() || "1";
  const incomeTable = env.BEA_INCOME_TABLE?.trim() || "SAINC1";
  const incomeLine = env.BEA_INCOME_LINE?.trim() || "3";
  const [gdp, income] = await Promise.all([
    fetchTable(userId, gdpTable, gdpLine, fetchedAt),
    fetchTable(userId, incomeTable, incomeLine, fetchedAt),
  ]);
  return { gdp, income, source_url: BEA_API_DOCS };
}

export function parseBeaFile(payload: unknown, fetchedAt: string): BeaExtract {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const gdpTable = "SAGDP2N";
  const incomeTable = "SAINC1";
  const gdp = root.gdp
    ? parseBeaData(root.gdp, {
        table: gdpTable,
        line: "1",
        source_url: beaSourceUrl(gdpTable, "1"),
        fetched_at: fetchedAt,
      })
    : [];
  const incomeSource = root.income ?? (root.BEAAPI ? payload : null);
  const income = incomeSource
    ? parseBeaData(incomeSource, {
        table: incomeTable,
        line: "3",
        source_url: beaSourceUrl(incomeTable, "3"),
        fetched_at: fetchedAt,
      })
    : [];
  return { gdp, income, source_url: BEA_API_DOCS };
}

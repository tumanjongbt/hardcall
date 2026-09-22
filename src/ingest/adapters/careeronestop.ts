import type { WageRecord } from "./bls";
import { parseNumber } from "../csv";
import { careerOneStopAuth, CREDENTIAL_HELP } from "../credentials";
import { fetchJson } from "../fetch_feed";
import {
  CAREERONESTOP_API_ORIGIN,
  CAREERONESTOP_CERT_DOCS,
  CAREERONESTOP_LICENSE_DOCS,
  CAREERONESTOP_WAGE_DOCS,
} from "../urls";

export const COS_ATTRIBUTION =
  "U.S. Department of Labor, Employment and Training Administration (DOLETA) and the Minnesota Department of Employment and Economic Development (DEED), via CareerOneStop.";

const GEO_KEY = /^(lat|lng|long|latitude|longitude|geocode|geocodes|bing|bingmaps|coordinates)$/i;

/** Microsoft Bing geocodes must not be stored or shared (CareerOneStop license). */
export function stripGeocodes<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripGeocodes(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (GEO_KEY.test(key)) continue;
      out[key] = stripGeocodes(child);
    }
    return out as T;
  }
  return value;
}

export type LicenseRecord = {
  license_id: string;
  title: string;
  state: string | null;
  agency_name: string | null;
  agency_url: string | null;
  active_status: string | null;
  source: "careeronestop";
  source_url: string;
  fetched_at: string;
};

export type CertificationRecord = {
  cert_id: string;
  name: string;
  organization: string | null;
  url: string | null;
  cert_type: string | null;
  source: "careeronestop";
  source_url: string;
  fetched_at: string;
};

export type CareerOneStopBundle = {
  licenses: LicenseRecord[];
  certifications: CertificationRecord[];
  wages: WageRecord[];
  license_reported: number | null;
  certification_reported: number | null;
};

type Provenance = { fetched_at: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function httpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
}

function wageNumber(raw: string): number | null {
  if (/\+$/.test(raw.trim())) return null;
  return parseNumber(raw);
}

export function parseLicenses(
  payload: unknown,
  provenance: Provenance,
  opts?: { limit?: number }
): { rows: LicenseRecord[]; reported: number | null } {
  const root = asRecord(stripGeocodes(payload));
  const list = root?.LicenseList;
  if (!Array.isArray(list)) return { rows: [], reported: null };
  const reported = parseNumber(text(root?.RecordCount)) ?? (typeof root?.RecordCount === "number" ? root.RecordCount : null);
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const rows: LicenseRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const license_id = text(row.ID ?? row.Id ?? row.id);
    const title = text(row.Title ?? row.Name);
    if (!license_id || !title) continue;
    if (seen.has(license_id)) continue;
    seen.add(license_id);
    const agency = asRecord(row.LicenseAgency);
    rows.push({
      license_id,
      title,
      state: text(row.State) || null,
      agency_name: text(agency?.Name) || null,
      agency_url: httpUrl(text(agency?.Url)),
      active_status: text(row.ActiveStatusDesc) || null,
      source: "careeronestop",
      source_url: CAREERONESTOP_LICENSE_DOCS,
      fetched_at: provenance.fetched_at,
    });
    if (rows.length >= limit) break;
  }
  return { rows, reported };
}

export function parseCertifications(
  payload: unknown,
  provenance: Provenance,
  opts?: { limit?: number }
): { rows: CertificationRecord[]; reported: number | null } {
  const root = asRecord(stripGeocodes(payload));
  const list = root?.CertList ?? root?.CertificationList;
  if (!Array.isArray(list)) return { rows: [], reported: null };
  const reportedRaw = root?.RecordCount;
  const reported =
    typeof reportedRaw === "number" ? reportedRaw : parseNumber(text(reportedRaw));
  const limit = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
  const rows: CertificationRecord[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const cert_id = text(row.Id ?? row.ID ?? row.id);
    const name = text(row.Name ?? row.Title);
    if (!cert_id || !name) continue;
    if (seen.has(cert_id)) continue;
    seen.add(cert_id);
    rows.push({
      cert_id,
      name,
      organization: text(row.Organization) || null,
      url: httpUrl(text(row.Url)),
      cert_type: text(row.Type) || null,
      source: "careeronestop",
      source_url: CAREERONESTOP_CERT_DOCS,
      fetched_at: provenance.fetched_at,
    });
    if (rows.length >= limit) break;
  }
  return { rows, reported };
}

export function parseWageCompare(payload: unknown, provenance: Provenance): WageRecord[] {
  const root = asRecord(stripGeocodes(payload));
  const detail = asRecord(root?.OccupationDetail);
  const wages = asRecord(detail?.Wages);
  if (!detail || !wages) return [];
  const title = text(detail.OccupationTitle);
  if (!title) return [];
  const socInfo = Array.isArray(detail.SocInfo) ? asRecord(detail.SocInfo[0]) : null;
  const soc = text(socInfo?.SocCode ?? detail.OccupationCode) || null;
  const year = text(wages.WageYear);
  const period = year || "OEWS";
  const buckets = new Map<
    string,
    {
      area_code: string;
      area_name: string;
      area_type: "national" | "state";
      median_annual_wage: number | null;
      median_hourly_wage: number | null;
    }
  >();

  const lists: { kind: "national" | "state"; rows: unknown }[] = [
    { kind: "national", rows: wages.NationalWagesList },
    { kind: "state", rows: wages.StateWagesList },
  ];
  for (const list of lists) {
    if (!Array.isArray(list.rows)) continue;
    for (const item of list.rows) {
      const row = asRecord(item);
      if (!row) continue;
      const areaName = text(row.AreaName) || (list.kind === "national" ? "United States" : "");
      if (!areaName) continue;
      const national = list.kind === "national" || areaName.toLowerCase() === "united states" || text(row.StFips) === "00";
      const area_code = national ? "US" : text(row.StFips) || areaName;
      const key = `${area_code}|${period}`;
      const bucket = buckets.get(key) ?? {
        area_code,
        area_name: areaName,
        area_type: national ? "national" : "state",
        median_annual_wage: null,
        median_hourly_wage: null,
      };
      const median = wageNumber(text(row.Median));
      const rate = text(row.RateType).toLowerCase();
      if (rate === "annual") bucket.median_annual_wage = median;
      if (rate === "hourly") bucket.median_hourly_wage = median;
      buckets.set(key, bucket);
    }
  }

  return [...buckets.values()].map((bucket) => ({
    soc_code: soc,
    occupation_title: title,
    area_code: bucket.area_code,
    area_name: bucket.area_name,
    area_type: bucket.area_type,
    period,
    employment: null,
    mean_annual_wage: null,
    median_annual_wage: bucket.median_annual_wage,
    mean_hourly_wage: null,
    median_hourly_wage: bucket.median_hourly_wage,
    source: "careeronestop",
    source_url: CAREERONESTOP_WAGE_DOCS,
    fetched_at: provenance.fetched_at,
  }));
}

export function parseCareerOneStopPayload(
  payload: unknown,
  provenance: Provenance,
  opts?: { limit?: number }
): CareerOneStopBundle {
  const root = asRecord(payload) ?? {};
  const licensesPayload = root.licenses ?? (root.LicenseList ? root : {});
  const certsPayload = root.certifications ?? (root.CertList ? root : {});
  const wagesPayload = root.wages ?? (root.OccupationDetail ? root : {});
  const licenses = parseLicenses(licensesPayload, provenance, opts);
  const certifications = parseCertifications(certsPayload, provenance, opts);
  return {
    licenses: licenses.rows,
    certifications: certifications.rows,
    wages: parseWageCompare(wagesPayload, provenance),
    license_reported: licenses.reported,
    certification_reported: certifications.reported,
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paged(
  buildUrl: (start: number, limit: number) => string,
  token: string,
  listKey: "LicenseList" | "CertList",
  maxRecords: number
): Promise<{ merged: Record<string, unknown>; reported: number | null }> {
  const pageSize = positiveInt(process.env.CAREERONESTOP_PAGE_SIZE, 50);
  const seen = new Set<string>();
  const merged: unknown[] = [];
  let reported: number | null = null;
  let start = 0;
  while (merged.length < maxRecords) {
    const limit = Math.min(pageSize, maxRecords - merged.length);
    const body = asRecord(
      await fetchJson(buildUrl(start, limit), { headers: { authorization: `Bearer ${token}` } })
    );
    const list = body?.[listKey];
    const rows = Array.isArray(list) ? list : [];
    if (reported == null) {
      const count = body?.RecordCount;
      reported = typeof count === "number" ? count : parseNumber(text(count));
    }
    let added = 0;
    for (const item of rows) {
      const row = asRecord(item);
      const id = text(row?.ID ?? row?.Id ?? row?.id);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      merged.push(item);
      added += 1;
      if (merged.length >= maxRecords) break;
    }
    start += rows.length > 0 ? rows.length : limit;
    if (added === 0 || rows.length === 0) break;
    if (reported != null && start >= reported) break;
    await sleep(250);
  }
  return { merged: { [listKey]: merged, RecordCount: reported }, reported };
}

export async function fetchCareerOneStop(
  env: NodeJS.ProcessEnv,
  provenance: Provenance,
  opts?: { limit?: number }
): Promise<CareerOneStopBundle> {
  const auth = careerOneStopAuth(env);
  if (!auth) throw new Error(`careeronestop: ${CREDENTIAL_HELP.careeronestop}`);
  const maxRecords = opts?.limit ?? positiveInt(env.CAREERONESTOP_MAX_RECORDS, 200);
  const user = encodeURIComponent(auth.userId);
  const licenseKeyword = encodeURIComponent(env.CAREERONESTOP_LICENSE_KEYWORD?.trim() || "0");
  const licenseLocation = encodeURIComponent(env.CAREERONESTOP_LICENSE_LOCATION?.trim() || "0");
  const certKeyword = encodeURIComponent(env.CAREERONESTOP_CERT_KEYWORD?.trim() || "0");
  const licenses = await paged(
    (start, limit) =>
      `${CAREERONESTOP_API_ORIGIN}/v1/license/${user}/${licenseKeyword}/${licenseLocation}/Title/ASC/${start}/${limit}`,
    auth.token,
    "LicenseList",
    maxRecords
  );
  const certs = await paged(
    (start, limit) =>
      `${CAREERONESTOP_API_ORIGIN}/v1/certificationfinder/${user}/${certKeyword}/0/0/0/0/0/0/0/0/${start}/${limit}`,
    auth.token,
    "CertList",
    maxRecords
  );
  let wages: WageRecord[] = [];
  const wageKeyword = env.CAREERONESTOP_WAGE_KEYWORD?.trim();
  const wageLocation = env.CAREERONESTOP_WAGE_LOCATION?.trim();
  if (wageKeyword && !wageLocation) {
    throw new Error(
      "careeronestop: CAREERONESTOP_WAGE_KEYWORD is set; also set CAREERONESTOP_WAGE_LOCATION (state abbreviation or ZIP). Wage compare is optional."
    );
  }
  if (wageKeyword && wageLocation) {
    const url =
      `${CAREERONESTOP_API_ORIGIN}/v1/comparesalaries/${user}/wage` +
      `?keyword=${encodeURIComponent(wageKeyword)}&location=${encodeURIComponent(wageLocation)}&enableMetaData=false`;
    const body = await fetchJson(url, { headers: { authorization: `Bearer ${auth.token}` } });
    wages = parseWageCompare(body, provenance);
  }
  const parsedLicenses = parseLicenses(licenses.merged, provenance, { limit: maxRecords });
  const parsedCerts = parseCertifications(certs.merged, provenance, { limit: maxRecords });
  return {
    licenses: parsedLicenses.rows,
    certifications: parsedCerts.rows,
    wages,
    license_reported: parsedLicenses.reported,
    certification_reported: parsedCerts.reported,
  };
}

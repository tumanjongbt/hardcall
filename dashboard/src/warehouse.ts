import type { AudienceLens, InsightRow } from "./types";

export type EndpointStatus = "ok" | "missing" | "error";

export type EndpointResult<T> = {
  path: string;
  status: EndpointStatus;
  rows: T[];
  error: string | null;
};

export type Provenance = {
  source: string;
  source_url: string | null;
  fetched_at: string | null;
};

export type InstitutionRow = Provenance & {
  unitid: string;
  name: string;
  city: string | null;
  state: string | null;
  control: string | null;
  level: string | null;
  operating: boolean | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  net_price: number | null;
  median_earnings: number | null;
};

export type ProgramRow = Provenance & {
  institution_unitid: string;
  institution_name: string | null;
  cip_code: string;
  cip_title: string | null;
  credential_level: string;
  credential_title: string | null;
  median_earnings: number | null;
  median_debt: number | null;
  state: string | null;
};

export type SponsorRow = Provenance & {
  name: string;
  state: string | null;
  city: string | null;
  organization_type: string | null;
  website: string | null;
};

export type WageRow = Provenance & {
  soc_code: string | null;
  occupation_title: string;
  area_code: string | null;
  area_name: string | null;
  area_type: string | null;
  period: string | null;
  median_annual_wage: number | null;
  mean_annual_wage: number | null;
  employment: number | null;
};

export type ProjectionRow = Provenance & {
  soc_code: string | null;
  occupation_title: string;
  occupation_type: string | null;
  period: string | null;
  change_percent: number | null;
  employment_base: number | null;
  employment_proj: number | null;
  typical_education: string | null;
};

export type CredentialRow = Provenance & {
  id: string;
  name: string;
  organization: string | null;
  url: string | null;
  state: string | null;
  cip_code: string | null;
  kind: string | null;
};

export type LicenseRow = Provenance & {
  id: string;
  title: string;
  state: string | null;
  agency_name: string | null;
  agency_url: string | null;
};

export type CertificationRow = Provenance & {
  id: string;
  name: string;
  organization: string | null;
  url: string | null;
  state: string | null;
};

export type EconPoint = Provenance & {
  dataset: "census" | "bea" | "fred";
  name: string;
  geo: string | null;
  metric: string;
  value: number;
  unit: string | null;
  period: string | null;
};

export type ApiFeed = {
  id: string;
  label: string | null;
  source: string | null;
  fetched_at: string | null;
  source_url: string | null;
  count: number | null;
};

export type WarehouseSnapshot = {
  institutions: EndpointResult<InstitutionRow>;
  programs: EndpointResult<ProgramRow>;
  sponsors: EndpointResult<SponsorRow>;
  wages: EndpointResult<WageRow>;
  projections: EndpointResult<ProjectionRow>;
  credentials: EndpointResult<CredentialRow>;
  licenses: EndpointResult<LicenseRow>;
  certifications: EndpointResult<CertificationRow>;
  econ: EndpointResult<EconPoint>;
  feeds: EndpointResult<ApiFeed>;
};

export type DecisionFilters = {
  channel: string | null;
  state: string | null;
  cip: string | null;
  outlook: "grow" | "decline" | null;
  lens: AudienceLens | null;
};

export type PathChannel =
  | "university"
  | "community_college"
  | "trade"
  | "apprenticeship"
  | "automation";

const CC_LEVEL =
  /^(1|2)$|\bassociate\b|\bcertificate\b|\bcommunity\b|2-year|two-year|less than/i;
const UNI_LEVEL =
  /^(3|4|5|6|7|8)$|\bbachelor\b|\bmaster\b|\bdoctor\b|4-year|four-year|\bgraduate\b/i;
const CC_NAME = /community college|technical college|junior college/i;

export function emptyEndpoint<T>(path: string, status: EndpointStatus = "missing"): EndpointResult<T> {
  return { path, status, rows: [], error: status === "missing" ? null : null };
}

export function emptyWarehouse(): WarehouseSnapshot {
  return {
    institutions: emptyEndpoint("/api/institutions"),
    programs: emptyEndpoint("/api/institutions"),
    sponsors: emptyEndpoint("/api/institutions"),
    wages: emptyEndpoint("/api/wages"),
    projections: emptyEndpoint("/api/projections"),
    credentials: emptyEndpoint("/api/credentials"),
    licenses: emptyEndpoint("/api/licenses"),
    certifications: emptyEndpoint("/api/certifications"),
    econ: emptyEndpoint("/api/econ"),
    feeds: emptyEndpoint("/api/feeds"),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "+") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lowered.set(key.toLowerCase(), value);
  for (const key of keys) {
    if (key in row && row[key] != null && row[key] !== "") return row[key];
    const found = lowered.get(key.toLowerCase());
    if (found != null && found !== "") return found;
  }
  return undefined;
}

function httpUrl(value: unknown): string | null {
  const text = str(value);
  if (!text || !/^https?:\/\//i.test(text)) return null;
  return text;
}

function provenance(row: Record<string, unknown>, fallbackSource: string | null): Provenance {
  return {
    source: str(pick(row, ["source"])) ?? fallbackSource ?? "",
    source_url: httpUrl(pick(row, ["source_url", "sourceUrl", "url"])),
    fetched_at: str(pick(row, ["fetched_at", "fetchedAt"])),
  };
}

function listFrom(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  const rec = asRecord(body);
  if (!rec) return [];
  for (const key of keys) {
    const value = pick(rec, [key]);
    if (Array.isArray(value)) return value;
  }
  const nested = asRecord(pick(rec, ["data", "result", "payload"]));
  if (nested) {
    for (const key of keys) {
      const value = pick(nested, [key]);
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function unwrap(body: unknown): Record<string, unknown> {
  const rec = asRecord(body) ?? {};
  const nested = asRecord(pick(rec, ["data", "result", "payload", "econ"]));
  return nested ? { ...rec, ...nested } : rec;
}

export function scorecardChannel(input: {
  name?: string | null;
  level?: string | null;
  credential_level?: string | null;
  credential_title?: string | null;
}): "university" | "community_college" | null {
  const levelText = [input.level, input.credential_level, input.credential_title]
    .filter(Boolean)
    .join(" ");
  const name = input.name ?? "";
  if (CC_NAME.test(name) || (levelText && CC_LEVEL.test(levelText))) return "community_college";
  if (levelText && UNI_LEVEL.test(levelText)) return "university";
  return null;
}

export function occupationChannel(
  changePercent: number | null | undefined
): "trade" | "automation" {
  if (typeof changePercent === "number" && Number.isFinite(changePercent) && changePercent < 0) {
    return "automation";
  }
  return "trade";
}

function credentialChannel(text: string): "apprenticeship" | "trade" {
  return /apprentice/i.test(text) ? "apprenticeship" : "trade";
}

export function parseInstitutions(body: unknown): InstitutionRow[] {
  return listFrom(body, ["institutions", "schools", "rows"])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = str(pick(row, ["name", "instnm", "institution_name", "school_name"]));
      if (!name) return null;
      const operatingRaw = pick(row, ["operating", "curroper"]);
      const operating =
        operatingRaw == null
          ? null
          : operatingRaw === true || operatingRaw === 1 || operatingRaw === "1";
      return {
        unitid: str(pick(row, ["unitid", "id"])) ?? name,
        name,
        city: str(pick(row, ["city"])),
        state: str(pick(row, ["state", "stabbr"])),
        control: str(pick(row, ["control"])),
        level: str(pick(row, ["level", "predominant_degree", "preddeg", "sector", "sch_deg", "ccbasic"])),
        operating,
        tuition_in_state: num(pick(row, ["tuition_in_state", "tuitionfee_in", "tuition_in"])),
        tuition_out_state: num(pick(row, ["tuition_out_state", "tuitionfee_out", "tuition_out"])),
        net_price: num(pick(row, ["net_price", "npt4_pub", "npt4_priv", "npt4"])),
        median_earnings: num(pick(row, ["median_earnings", "md_earn_wne_p10", "earn_mdn"])),
        ...provenance(row, "scorecard"),
      } satisfies InstitutionRow;
    })
    .filter((row): row is InstitutionRow => row !== null);
}

export function parsePrograms(body: unknown): ProgramRow[] {
  const root = unwrap(body);
  const direct = listFrom(root, ["programs", "fields_of_study", "field_of_study"]);
  const nested = parseInstitutions(body).length
    ? listFrom(body, ["institutions", "schools"]).flatMap((item) => {
        const row = asRecord(item);
        return row ? listFrom(row, ["programs"]) : [];
      })
    : [];
  return [...direct, ...nested]
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const cip = str(pick(row, ["cip_code", "cipcode", "cip"]));
      if (!cip) return null;
      const parent = asRecord(row);
      return {
        institution_unitid: str(pick(row, ["institution_unitid", "unitid"])) ?? "",
        institution_name: str(pick(row, ["institution_name", "instnm", "name"])),
        cip_code: cip,
        cip_title: str(pick(row, ["cip_title", "cipdesc", "title"])),
        credential_level: str(pick(row, ["credential_level", "credlev"])) ?? "",
        credential_title: str(pick(row, ["credential_title", "creddesc"])),
        median_earnings: num(pick(row, ["median_earnings", "earn_mdn_hi_1yr", "earnings"])),
        median_debt: num(pick(row, ["median_debt", "debt_all_stgp_any_mdn", "debt"])),
        state: str(pick(row, ["state", "stabbr"])),
        ...provenance(parent ?? row, "scorecard"),
      } satisfies ProgramRow;
    })
    .filter((row): row is ProgramRow => row !== null);
}

export function parseSponsors(body: unknown): SponsorRow[] {
  return listFrom(unwrap(body), ["sponsors", "apprenticeship_sponsors", "apprenticeships"])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = str(pick(row, ["name", "organization_name", "sponsor_name"]));
      if (!name) return null;
      return {
        name,
        state: str(pick(row, ["state"])),
        city: str(pick(row, ["city"])),
        organization_type: str(pick(row, ["organization_type", "type"])),
        website: httpUrl(pick(row, ["website", "url"])),
        ...provenance(row, "apprenticeship_gov"),
      } satisfies SponsorRow;
    })
    .filter((row): row is SponsorRow => row !== null);
}

export function parseWages(body: unknown): WageRow[] {
  return listFrom(body, ["wages", "wage_observations", "rows", "observations"])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const title = str(pick(row, ["occupation_title", "title", "occ_title"]));
      if (!title) return null;
      return {
        soc_code: str(pick(row, ["soc_code", "soc", "onet_soc"])),
        occupation_title: title,
        area_code: str(pick(row, ["area_code", "area"])),
        area_name: str(pick(row, ["area_name"])),
        area_type: str(pick(row, ["area_type"])),
        period: str(pick(row, ["period", "year"])),
        median_annual_wage: num(pick(row, ["median_annual_wage", "a_median", "median_annual"])),
        mean_annual_wage: num(pick(row, ["mean_annual_wage", "a_mean", "mean_annual"])),
        employment: num(pick(row, ["employment", "tot_emp"])),
        ...provenance(row, "bls"),
      } satisfies WageRow;
    })
    .filter((row): row is WageRow => row !== null);
}

export function parseProjections(body: unknown): ProjectionRow[] {
  return listFrom(body, ["projections", "rows", "occupations"])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const title = str(pick(row, ["occupation_title", "title", "occ_title"]));
      if (!title) return null;
      return {
        soc_code: str(pick(row, ["soc_code", "soc"])),
        occupation_title: title,
        occupation_type: str(pick(row, ["occupation_type", "occ_type"])),
        period: str(pick(row, ["period"])),
        change_percent: num(pick(row, ["change_percent", "pct_change", "percent_change"])),
        employment_base: num(pick(row, ["employment_base"])),
        employment_proj: num(pick(row, ["employment_proj", "employment_projected"])),
        typical_education: str(pick(row, ["typical_education", "education"])),
        ...provenance(row, "bls_ep"),
      } satisfies ProjectionRow;
    })
    .filter((row): row is ProjectionRow => row !== null);
}

export function parseCredentials(body: unknown): CredentialRow[] {
  return listFrom(body, ["credentials", "rows", "items"])
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = str(pick(row, ["name", "title", "credential_name"]));
      if (!name) return null;
      return {
        id: str(pick(row, ["id", "ctid", "credential_id"])) ?? `credential-${index}`,
        name,
        organization: str(pick(row, ["organization", "org", "provider", "ownedBy"])),
        url: httpUrl(pick(row, ["url", "credential_url"])),
        state: str(pick(row, ["state"])),
        cip_code: str(pick(row, ["cip_code", "cip"])),
        kind: str(pick(row, ["kind", "type", "credential_type"])),
        ...provenance(row, null),
      } satisfies CredentialRow;
    })
    .filter((row): row is CredentialRow => row !== null);
}

export function parseLicenses(body: unknown): LicenseRow[] {
  return listFrom(body, ["licenses", "rows", "items"])
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const title = str(pick(row, ["title", "name", "license_title"]));
      if (!title) return null;
      return {
        id: str(pick(row, ["license_id", "id"])) ?? `license-${index}`,
        title,
        state: str(pick(row, ["state"])),
        agency_name: str(pick(row, ["agency_name", "agency"])),
        agency_url: httpUrl(pick(row, ["agency_url"])),
        ...provenance(row, "careeronestop"),
      } satisfies LicenseRow;
    })
    .filter((row): row is LicenseRow => row !== null);
}

export function parseCertifications(body: unknown): CertificationRow[] {
  return listFrom(body, ["certifications", "certs", "rows", "items"])
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const name = str(pick(row, ["name", "title"]));
      if (!name) return null;
      return {
        id: str(pick(row, ["cert_id", "id"])) ?? `cert-${index}`,
        name,
        organization: str(pick(row, ["organization", "org", "organization_name"])),
        url: httpUrl(pick(row, ["url"])),
        state: str(pick(row, ["state"])),
        ...provenance(row, "careeronestop"),
      } satisfies CertificationRow;
    })
    .filter((row): row is CertificationRow => row !== null);
}

function pushEcon(
  points: EconPoint[],
  row: Record<string, unknown>,
  dataset: EconPoint["dataset"],
  fallbackSource: string,
  metric: string,
  value: number | null,
  extra: { name?: string | null; geo?: string | null; period?: string | null; unit?: string | null }
): void {
  if (value == null) return;
  const prov = provenance(row, fallbackSource);
  points.push({
    dataset,
    name: extra.name || metric,
    geo: extra.geo ?? null,
    metric,
    value,
    unit: extra.unit ?? null,
    period: extra.period ?? null,
    ...prov,
    source: prov.source || fallbackSource,
  });
}

export function parseEcon(body: unknown): EconPoint[] {
  const root = unwrap(body);
  const points: EconPoint[] = [];
  for (const item of listFrom(root, ["census", "acs", "places"])) {
    const row = asRecord(item);
    if (!row) continue;
    const name = str(pick(row, ["name", "geo_name"])) ?? "Census place";
    const geo = str(pick(row, ["geo_id", "geo", "state"])) ?? name;
    const period = str(pick(row, ["year", "period"]));
    pushEcon(points, row, "census", "census", "Median household income", num(pick(row, ["median_household_income"])), {
      name,
      geo,
      period,
      unit: "dollars",
    });
    pushEcon(points, row, "census", "census", "Per capita income", num(pick(row, ["per_capita_income"])), {
      name,
      geo,
      period,
      unit: "dollars",
    });
    pushEcon(points, row, "census", "census", "Unemployed", num(pick(row, ["unemployed"])), {
      name,
      geo,
      period,
      unit: "persons",
    });
    pushEcon(points, row, "census", "census", "Civilian labor force", num(pick(row, ["civilian_labor_force"])), {
      name,
      geo,
      period,
      unit: "persons",
    });
    const explicitRate = num(pick(row, ["unemployment_rate", "unemployment"]));
    pushEcon(points, row, "census", "census", "Unemployment rate", explicitRate, {
      name,
      geo,
      period,
      unit: "percent",
    });
  }
  const beaItems = [
    ...listFrom(root, ["bea"]),
    ...listFrom(root, ["income"]),
    ...listFrom(root, ["gdp"]),
  ];
  const beaRoot = asRecord(pick(root, ["bea"]));
  if (beaRoot) {
    beaItems.push(...listFrom(beaRoot, ["income", "gdp", "rows", "observations"]));
  }
  for (const item of beaItems) {
    const row = asRecord(item);
    if (!row) continue;
    const value = num(pick(row, ["value", "DataValue"]));
    if (value == null) continue;
    const table = str(pick(row, ["table"])) ?? "BEA";
    pushEcon(points, row, "bea", "bea", table, value, {
      name: str(pick(row, ["geo_name", "name"])) ?? table,
      geo: str(pick(row, ["geo_fips", "geo_name", "geo"])),
      period: str(pick(row, ["time_period", "period", "year"])),
      unit: str(pick(row, ["unit"])),
    });
  }
  for (const item of listFrom(root, ["fred", "series", "observations"])) {
    const row = asRecord(item);
    if (!row) continue;
    const value = num(pick(row, ["value"]));
    if (value == null) continue;
    const title = str(pick(row, ["title", "series_id"])) ?? "FRED series";
    pushEcon(points, row, "fred", "fred", title, value, {
      name: title,
      geo: "United States",
      period: str(pick(row, ["date", "period"])),
      unit: str(pick(row, ["unit"])),
    });
  }
  return points;
}

export function parseFeeds(body: unknown): ApiFeed[] {
  return listFrom(body, ["feeds", "sources", "datasets", "rows"])
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const id = str(pick(row, ["id", "key", "source", "name"]));
      if (!id) return null;
      return {
        id,
        label: str(pick(row, ["label", "name", "title"])),
        source: str(pick(row, ["source", "id"])),
        fetched_at: str(pick(row, ["fetched_at", "fetchedAt", "last_fetched_at"])),
        source_url: httpUrl(pick(row, ["source_url", "sourceUrl", "url"])),
        count: num(pick(row, ["count", "rows"])),
      } satisfies ApiFeed;
    })
    .filter((row): row is ApiFeed => row !== null);
}

type FetchLike = typeof fetch;

async function readEndpoint(path: string, base: string, fetchImpl: FetchLike): Promise<{
  status: EndpointStatus;
  body: unknown;
  error: string | null;
}> {
  try {
    const res = await fetchImpl(`${base}${path}`);
    if (res.status === 404) return { status: "missing", body: null, error: null };
    if (!res.ok) return { status: "error", body: null, error: `GET ${path} returned HTTP ${res.status}.` };
    try {
      return { status: "ok", body: await res.json(), error: null };
    } catch {
      return { status: "error", body: null, error: `GET ${path} did not return JSON.` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed.";
    return { status: "error", body: null, error: `GET ${path} failed: ${message}` };
  }
}

export async function loadWarehouse(
  base: string,
  fetchImpl: FetchLike = fetch
): Promise<WarehouseSnapshot> {
  const paths = [
    "/api/institutions",
    "/api/wages",
    "/api/projections",
    "/api/credentials",
    "/api/licenses",
    "/api/certifications",
    "/api/econ",
    "/api/feeds",
  ] as const;
  const results = await Promise.all(paths.map((path) => readEndpoint(path, base, fetchImpl)));
  const byPath = new Map(paths.map((path, index) => [path, results[index]!]));
  const institutions = byPath.get("/api/institutions")!;
  const institutionStatus = institutions.status;
  return {
    institutions: {
      path: "/api/institutions",
      status: institutionStatus,
      rows: institutionStatus === "ok" ? parseInstitutions(institutions.body) : [],
      error: institutions.error,
    },
    programs: {
      path: "/api/institutions",
      status: institutionStatus,
      rows: institutionStatus === "ok" ? parsePrograms(institutions.body) : [],
      error: institutions.error,
    },
    sponsors: {
      path: "/api/institutions",
      status: institutionStatus,
      rows: institutionStatus === "ok" ? parseSponsors(institutions.body) : [],
      error: institutions.error,
    },
    wages: {
      path: "/api/wages",
      status: byPath.get("/api/wages")!.status,
      rows: byPath.get("/api/wages")!.status === "ok" ? parseWages(byPath.get("/api/wages")!.body) : [],
      error: byPath.get("/api/wages")!.error,
    },
    projections: {
      path: "/api/projections",
      status: byPath.get("/api/projections")!.status,
      rows:
        byPath.get("/api/projections")!.status === "ok"
          ? parseProjections(byPath.get("/api/projections")!.body)
          : [],
      error: byPath.get("/api/projections")!.error,
    },
    credentials: {
      path: "/api/credentials",
      status: byPath.get("/api/credentials")!.status,
      rows:
        byPath.get("/api/credentials")!.status === "ok"
          ? parseCredentials(byPath.get("/api/credentials")!.body)
          : [],
      error: byPath.get("/api/credentials")!.error,
    },
    licenses: {
      path: "/api/licenses",
      status: byPath.get("/api/licenses")!.status,
      rows:
        byPath.get("/api/licenses")!.status === "ok"
          ? parseLicenses(byPath.get("/api/licenses")!.body)
          : [],
      error: byPath.get("/api/licenses")!.error,
    },
    certifications: {
      path: "/api/certifications",
      status: byPath.get("/api/certifications")!.status,
      rows:
        byPath.get("/api/certifications")!.status === "ok"
          ? parseCertifications(byPath.get("/api/certifications")!.body)
          : [],
      error: byPath.get("/api/certifications")!.error,
    },
    econ: {
      path: "/api/econ",
      status: byPath.get("/api/econ")!.status,
      rows: byPath.get("/api/econ")!.status === "ok" ? parseEcon(byPath.get("/api/econ")!.body) : [],
      error: byPath.get("/api/econ")!.error,
    },
    feeds: {
      path: "/api/feeds",
      status: byPath.get("/api/feeds")!.status,
      rows: byPath.get("/api/feeds")!.status === "ok" ? parseFeeds(byPath.get("/api/feeds")!.body) : [],
      error: byPath.get("/api/feeds")!.error,
    },
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number): string {
  const body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(value));
  if (value > 0) return `+${body}%`;
  if (value < 0) return `-${body}%`;
  return `${body}%`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function stateMatch(value: string | null | undefined, filter: string | null): boolean {
  if (!filter) return true;
  if (!value) return false;
  const needle = filter.trim().toLowerCase();
  const hay = value.trim().toLowerCase();
  return hay === needle || hay.includes(needle);
}

function cipMatch(code: string | null | undefined, title: string | null | undefined, filter: string | null): boolean {
  if (!filter) return true;
  const needle = filter.trim().toLowerCase();
  return `${code ?? ""} ${title ?? ""}`.toLowerCase().includes(needle);
}

function isNational(row: WageRow): boolean {
  const area = `${row.area_type ?? ""} ${row.area_code ?? ""} ${row.area_name ?? ""}`.toLowerCase();
  return area.includes("national") || area.includes("united states") || row.area_code === "US" || row.area_code === "99";
}

function wageValue(row: WageRow): number | null {
  return row.median_annual_wage ?? row.mean_annual_wage;
}

function isTotalOccupation(title: string): boolean {
  return /^total,\s*all occupations$/i.test(title) || /^all occupations$/i.test(title);
}

function lineProjections(rows: ProjectionRow[]): ProjectionRow[] {
  const lines = rows.filter((row) => row.occupation_type === "line");
  const pool = lines.length > 0 ? lines : rows.filter((row) => row.occupation_type !== "summary");
  return pool.filter((row) => !isTotalOccupation(row.occupation_title) && row.change_percent != null);
}

function decliningSocs(rows: ProjectionRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of lineProjections(rows)) {
    if (row.soc_code && row.change_percent != null && row.change_percent < 0) set.add(row.soc_code);
  }
  return set;
}

export function filteredPrograms(snapshot: WarehouseSnapshot, filters: DecisionFilters): ProgramRow[] {
  return snapshot.programs.rows.filter((row) => {
    if (!stateMatch(row.state, filters.state)) return false;
    if (!cipMatch(row.cip_code, row.cip_title, filters.cip)) return false;
    if (!filters.channel) return true;
    return scorecardChannel(row) === filters.channel;
  });
}

export function filteredInstitutions(snapshot: WarehouseSnapshot, filters: DecisionFilters): InstitutionRow[] {
  return snapshot.institutions.rows.filter((row) => {
    if (!stateMatch(row.state, filters.state)) return false;
    if (filters.cip) return false;
    if (!filters.channel) return true;
    return scorecardChannel(row) === filters.channel;
  });
}

export function filteredWages(snapshot: WarehouseSnapshot, filters: DecisionFilters): WageRow[] {
  if (filters.cip) return [];
  if (filters.state) {
    const narrowed = snapshot.wages.rows.filter((row) => stateMatch(row.area_name, filters.state) || stateMatch(row.area_code, filters.state));
    return narrowed.filter((row) => wageMatchesChannel(row, snapshot, filters.channel));
  }
  const national = snapshot.wages.rows.filter(isNational);
  const pool = national.length > 0 ? national : snapshot.wages.rows;
  return pool.filter((row) => wageMatchesChannel(row, snapshot, filters.channel));
}

function wageMatchesChannel(row: WageRow, snapshot: WarehouseSnapshot, channel: string | null): boolean {
  if (!channel) return true;
  const mapped = occupationChannel(row.soc_code && decliningSocs(snapshot.projections.rows).has(row.soc_code) ? -1 : null);
  return mapped === channel;
}

export function filteredProjections(snapshot: WarehouseSnapshot, filters: DecisionFilters): ProjectionRow[] {
  if (filters.cip || filters.state) return [];
  const outlook = effectiveOutlook(filters);
  return lineProjections(snapshot.projections.rows).filter((row) => {
    const channel = occupationChannel(row.change_percent);
    if (filters.channel && channel !== filters.channel) return false;
    if (outlook === "grow") return (row.change_percent ?? 0) > 0;
    if (outlook === "decline") return (row.change_percent ?? 0) < 0;
    return true;
  });
}

function effectiveOutlook(filters: DecisionFilters): "grow" | "decline" | null {
  if (filters.outlook) return filters.outlook;
  if (filters.lens === "students") return "grow";
  if (filters.lens === "parents") return "decline";
  return null;
}

export type WageBucket = { label: string; count: number };

const WAGE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "Under $30k", min: 0, max: 30_000 },
  { label: "$30–50k", min: 30_000, max: 50_000 },
  { label: "$50–75k", min: 50_000, max: 75_000 },
  { label: "$75–100k", min: 75_000, max: 100_000 },
  { label: "$100–150k", min: 100_000, max: 150_000 },
  { label: "$150k+", min: 150_000, max: Number.POSITIVE_INFINITY },
];

export function wageDistribution(snapshot: WarehouseSnapshot, filters: DecisionFilters): {
  buckets: WageBucket[];
  scope: string;
  emptyReason: string | null;
} {
  if (snapshot.wages.status === "missing") {
    return { buckets: [], scope: "", emptyReason: "GET /api/wages is not on this API yet." };
  }
  if (snapshot.wages.status === "error") {
    return { buckets: [], scope: "", emptyReason: snapshot.wages.error };
  }
  const rows = filteredWages(snapshot, filters).filter((row) => !isTotalOccupation(row.occupation_title) && wageValue(row) != null);
  if (rows.length === 0) {
    return {
      buckets: [],
      scope: "",
      emptyReason: filters.cip
        ? "OEWS rows have no CIP field, so a CIP filter leaves this chart empty."
        : filters.state
          ? "No wage rows match that state. National OEWS rows are omitted while a state filter is set."
          : "No wage rows include median_annual_wage or mean_annual_wage.",
    };
  }
  const national = snapshot.wages.rows.some(isNational);
  const buckets = WAGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: rows.filter((row) => {
      const value = wageValue(row)!;
      return value >= bucket.min && value < bucket.max;
    }).length,
  })).filter((bucket) => bucket.count > 0);
  return {
    buckets,
    scope: national && !filters.state
      ? "National OEWS rows only. Median annual wage, or mean annual when median is null."
      : "Rows in this response with a published annual wage. Median annual, or mean annual when median is null.",
    emptyReason: buckets.length === 0 ? "Wage values did not fall into a bucket." : null,
  };
}

export type ProjectionBar = {
  label: string;
  value: number;
  source_url: string | null;
  soc_code: string | null;
};

export function projectionSeries(snapshot: WarehouseSnapshot, filters: DecisionFilters): {
  bars: ProjectionBar[];
  emptyReason: string | null;
  note: string;
} {
  const note =
    "Published change_percent from the projection file. Annual employment projections, not advice and not a prediction of one person's outcome.";
  if (snapshot.projections.status === "missing") {
    return { bars: [], emptyReason: "GET /api/projections is not on this API yet.", note };
  }
  if (snapshot.projections.status === "error") {
    return { bars: [], emptyReason: snapshot.projections.error, note };
  }
  if (filters.state || filters.cip) {
    return {
      bars: [],
      emptyReason: "Projection rows in this contract are national SOC figures. They are hidden while a state or CIP filter is set.",
      note,
    };
  }
  const rows = filteredProjections(snapshot, filters)
    .slice()
    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0) || a.occupation_title.localeCompare(b.occupation_title));
  if (rows.length === 0) {
    return { bars: [], emptyReason: "No projection rows include change_percent for this lens and outlook.", note };
  }
  const growing = rows.filter((row) => (row.change_percent ?? 0) > 0).slice(0, 8);
  const declining = rows.filter((row) => (row.change_percent ?? 0) < 0).slice(-8);
  const outlook = effectiveOutlook(filters);
  const picked = outlook === "grow" ? growing : outlook === "decline" ? declining : [...growing, ...declining];
  return {
    bars: picked.map((row) => ({
      label: row.occupation_title,
      value: row.change_percent!,
      source_url: row.source_url,
      soc_code: row.soc_code,
    })),
    emptyReason: picked.length === 0 ? "No rows match this grow/decline cut." : null,
    note,
  };
}

export type CostPoint = {
  label: string;
  cost: number;
  earnings: number;
  source_url: string | null;
};

export function costEarningsSeries(
  snapshot: WarehouseSnapshot,
  filters: DecisionFilters
): { points: CostPoint[]; metric: string; emptyReason: string | null; shown: number; total: number } {
  const parentMetric = filters.lens === "parents";
  if (parentMetric) {
    if (snapshot.institutions.status === "missing") {
      return {
        points: [],
        metric: "Net price or in-state tuition vs median earnings",
        emptyReason: "GET /api/institutions is not on this API yet.",
        shown: 0,
        total: 0,
      };
    }
    const paired = filteredInstitutions(snapshot, filters)
      .map((row) => {
        const cost = row.net_price ?? row.tuition_in_state;
        if (cost == null || row.median_earnings == null) return null;
        return {
          label: row.name,
          cost,
          earnings: row.median_earnings,
          source_url: row.source_url,
          usedNet: row.net_price != null,
        };
      })
      .filter((row): row is CostPoint & { usedNet: boolean } => row !== null)
      .sort((a, b) => b.earnings - a.earnings);
    const points = paired.slice(0, 40).map(({ usedNet: _used, ...point }) => point);
    return {
      points,
      metric: "Institution net price, or in-state tuition when net price is null, vs median earnings",
      emptyReason:
        points.length === 0
          ? "No institution rows include both a cost field (net_price or tuition_in_state) and median_earnings."
          : null,
      shown: points.length,
      total: paired.length,
    };
  }
  if (snapshot.programs.status === "missing") {
    return {
      points: [],
      metric: "Program median debt vs median earnings",
      emptyReason: "GET /api/institutions did not load, so program debt and earnings are unavailable.",
      shown: 0,
      total: 0,
    };
  }
  const paired = filteredPrograms(snapshot, filters)
    .filter((row) => row.median_debt != null && row.median_earnings != null)
    .sort((a, b) => (b.median_earnings ?? 0) - (a.median_earnings ?? 0));
  const points = paired.slice(0, 40).map((row) => ({
    label: `${row.cip_title ?? row.cip_code}${row.institution_name ? ` — ${row.institution_name}` : ""}`,
    cost: row.median_debt!,
    earnings: row.median_earnings!,
    source_url: row.source_url,
  }));
  return {
    points,
    metric: "Program median debt vs median earnings",
    emptyReason:
      points.length === 0
        ? snapshot.programs.rows.length === 0
          ? "This institutions response has no programs array with debt and earnings."
          : "No program rows include both median_debt and median_earnings for this filter."
        : null,
    shown: points.length,
    total: paired.length,
  };
}

export type MixSlice = { channel: PathChannel; count: number };

export function channelMix(snapshot: WarehouseSnapshot, filters: DecisionFilters): {
  slices: MixSlice[];
  unmapped: number;
  emptyReason: string | null;
  note: string;
} {
  const counts: Record<PathChannel, number> = {
    university: 0,
    community_college: 0,
    trade: 0,
    apprenticeship: 0,
    automation: 0,
  };
  let unmapped = 0;
  const programRows = filteredPrograms(snapshot, filters);
  const usePrograms = snapshot.programs.rows.length > 0;
  if (usePrograms) {
    for (const row of programRows) {
      const channel = scorecardChannel(row);
      if (!channel) unmapped += 1;
      else if (!filters.channel || filters.channel === channel) counts[channel] += 1;
    }
  } else {
    for (const row of snapshot.institutions.status === "ok" ? filteredInstitutions(snapshot, filters) : []) {
      const channel = scorecardChannel(row);
      if (!channel) unmapped += 1;
      else if (!filters.channel || filters.channel === channel) counts[channel] += 1;
    }
  }
  for (const row of snapshot.sponsors.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    if (filters.channel && filters.channel !== "apprenticeship") continue;
    counts.apprenticeship += 1;
  }
  const declining = decliningSocs(snapshot.projections.rows);
  const wageSocs = new Set<string>();
  for (const row of filteredWages(snapshot, { ...filters, channel: null })) {
    if (isTotalOccupation(row.occupation_title) || wageValue(row) == null) continue;
    if (row.soc_code) wageSocs.add(row.soc_code);
    const channel = row.soc_code && declining.has(row.soc_code) ? "automation" : "trade";
    if (filters.channel && filters.channel !== channel) continue;
    counts[channel] += 1;
  }
  if (!filters.state && !filters.cip) {
    for (const row of lineProjections(snapshot.projections.rows)) {
      if (row.soc_code && wageSocs.has(row.soc_code)) continue;
      const channel = occupationChannel(row.change_percent);
      if (filters.channel && filters.channel !== channel) continue;
      counts[channel] += 1;
    }
  }
  for (const row of snapshot.licenses.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    const channel = credentialChannel(row.title);
    if (filters.channel && filters.channel !== channel) continue;
    counts[channel] += 1;
  }
  for (const row of snapshot.certifications.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    const channel = credentialChannel(`${row.name} ${row.organization ?? ""}`);
    if (filters.channel && filters.channel !== channel) continue;
    counts[channel] += 1;
  }
  for (const row of snapshot.credentials.rows) {
    if (!stateMatch(row.state, filters.state) || !cipMatch(row.cip_code, row.name, filters.cip)) continue;
    const channel = credentialChannel(`${row.name} ${row.kind ?? ""}`);
    if (filters.channel && filters.channel !== channel) continue;
    counts[channel] += 1;
  }
  const slices = (Object.entries(counts) as Array<[PathChannel, number]>)
    .filter(([, count]) => count > 0)
    .map(([channel, count]) => ({ channel, count }));
  const anyEndpointOk = [
    snapshot.institutions,
    snapshot.wages,
    snapshot.licenses,
    snapshot.certifications,
    snapshot.credentials,
  ].some((endpoint) => endpoint.status === "ok");
  return {
    slices,
    unmapped,
    emptyReason: slices.length === 0
      ? anyEndpointOk
        ? "No warehouse rows mapped onto the five channels for this filter."
        : "Warehouse endpoints have not returned rows for a channel mix."
      : null,
    note: usePrograms
      ? "Scorecard programs map to University or Community College only when credential level or the name says so. OEWS maps to Trade, or Automation when the same SOC has a negative projection. Licenses, certs, and credentials map to Trade unless the name says apprenticeship. Unmapped scorecard rows are left out."
      : "Scorecard institutions map to University or Community College only when a level field or the name says so. Other grains follow the same rules. Unmapped rows are left out.",
  };
}

export type PathEntry = {
  channel: string;
  title: string;
  detail: string;
  source: string;
  source_url: string | null;
  fetched_at: string | null;
};

export function buildPaths(snapshot: WarehouseSnapshot, filters: DecisionFilters): PathEntry[] {
  const paths: PathEntry[] = [];
  for (const row of filteredPrograms(snapshot, filters)) {
    const channel = scorecardChannel(row) ?? "unmapped";
    const bits = [
      row.credential_title,
      row.median_debt != null ? `median debt ${formatUsd(row.median_debt)}` : null,
      row.median_earnings != null ? `median earnings ${formatUsd(row.median_earnings)}` : null,
      row.state,
    ].filter(Boolean);
    paths.push({
      channel,
      title: `${row.cip_title ?? row.cip_code}${row.institution_name ? ` — ${row.institution_name}` : ""}`,
      detail: bits.join(" · ") || row.cip_code,
      source: row.source || "scorecard",
      source_url: row.source_url,
      fetched_at: row.fetched_at,
    });
  }
  if (paths.length < 8) {
    for (const row of filteredInstitutions(snapshot, filters)) {
      const channel = scorecardChannel(row);
      if (!channel) continue;
      const cost = row.net_price ?? row.tuition_in_state;
      const bits = [
        row.city,
        row.state,
        cost != null ? `${row.net_price != null ? "net price" : "in-state tuition"} ${formatUsd(cost)}` : null,
        row.median_earnings != null ? `median earnings ${formatUsd(row.median_earnings)}` : null,
      ].filter(Boolean);
      paths.push({
        channel,
        title: row.name,
        detail: bits.join(" · ") || "Institution row",
        source: row.source || "scorecard",
        source_url: row.source_url,
        fetched_at: row.fetched_at,
      });
    }
  }
  for (const row of snapshot.sponsors.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    if (filters.channel && filters.channel !== "apprenticeship") continue;
    paths.push({
      channel: "apprenticeship",
      title: row.name,
      detail: [row.organization_type, row.city, row.state].filter(Boolean).join(" · ") || "Registered sponsor",
      source: row.source || "apprenticeship_gov",
      source_url: row.source_url ?? row.website,
      fetched_at: row.fetched_at,
    });
  }
  for (const row of snapshot.licenses.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    const channel = credentialChannel(row.title);
    if (filters.channel && filters.channel !== channel) continue;
    paths.push({
      channel,
      title: row.title,
      detail: [row.state, row.agency_name].filter(Boolean).join(" · ") || "License",
      source: row.source || "careeronestop",
      source_url: row.source_url ?? row.agency_url,
      fetched_at: row.fetched_at,
    });
  }
  for (const row of snapshot.certifications.rows) {
    if (!stateMatch(row.state, filters.state) || filters.cip) continue;
    const channel = credentialChannel(row.name);
    if (filters.channel && filters.channel !== channel) continue;
    paths.push({
      channel,
      title: row.name,
      detail: row.organization ?? "Certification",
      source: row.source || "careeronestop",
      source_url: row.source_url ?? row.url,
      fetched_at: row.fetched_at,
    });
  }
  for (const row of snapshot.credentials.rows) {
    if (!stateMatch(row.state, filters.state) || !cipMatch(row.cip_code, row.name, filters.cip)) continue;
    const channel = credentialChannel(`${row.name} ${row.kind ?? ""}`);
    if (filters.channel && filters.channel !== channel) continue;
    paths.push({
      channel,
      title: row.name,
      detail: [row.kind, row.organization, row.state].filter(Boolean).join(" · ") || "Credential",
      source: row.source,
      source_url: row.source_url ?? row.url,
      fetched_at: row.fetched_at,
    });
  }
  for (const row of filteredProjections(snapshot, filters).slice(0, 6)) {
    paths.push({
      channel: occupationChannel(row.change_percent),
      title: row.occupation_title,
      detail: [
        row.soc_code,
        row.change_percent != null ? formatPct(row.change_percent) : null,
        row.typical_education,
        row.period,
      ]
        .filter(Boolean)
        .join(" · "),
      source: row.source || "bls_ep",
      source_url: row.source_url,
      fetched_at: row.fetched_at,
    });
  }
  return paths.slice(0, 24);
}

export type DecisionTile = {
  id: string;
  title: string;
  value: string;
  detail: string;
  source: string;
  source_url: string | null;
  fetched_at: string | null;
  empty: boolean;
  lenses: Array<AudienceLens | "all">;
};

const DEMO_INSIGHT_SOURCES = new Set(["synthetic", "playground", "cli"]);

export function visibleApiInsights(rows: InsightRow[], allowDemo: boolean): InsightRow[] {
  if (allowDemo) return rows;
  return rows.filter((row) => {
    const source = row.source ?? "synthetic";
    return !DEMO_INSIGHT_SOURCES.has(source);
  });
}

function firstProvenance(rows: Provenance[]): { source: string; source_url: string | null; fetched_at: string | null } {
  const withUrl = rows.find((row) => row.source_url);
  const sample = withUrl ?? rows[0];
  return {
    source: sample?.source || "",
    source_url: sample?.source_url ?? null,
    fetched_at: sample?.fetched_at ?? null,
  };
}

function tile(partial: DecisionTile): DecisionTile {
  return partial;
}

function econTiles(snapshot: WarehouseSnapshot, filters: DecisionFilters): DecisionTile[] {
  if (snapshot.econ.status === "missing") {
    return [
      tile({
        id: "wh:econ-missing",
        title: "Census, BEA, and FRED",
        value: "No data",
        detail: "GET /api/econ is not on this API yet.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["workforce", "all"],
      }),
    ];
  }
  const wanted = snapshot.econ.rows.filter((row) => {
    if (filters.state && row.dataset !== "fred" && !stateMatch(row.geo, filters.state) && !stateMatch(row.name, filters.state)) {
      return false;
    }
    return true;
  });
  const preferNation = wanted.filter((row) => /united states|^us$/i.test(`${row.geo ?? ""} ${row.name}`));
  const pool = preferNation.length > 0 && !filters.state ? preferNation : wanted;
  const seen = new Set<string>();
  const tiles: DecisionTile[] = [];
  for (const row of pool) {
    const key = `${row.dataset}:${row.metric}:${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const value =
      row.unit === "dollars" ? formatUsd(row.value) : row.unit === "percent" ? formatPct(row.value).replace(/^\+/, "") : formatCount(row.value);
    tiles.push(
      tile({
        id: `wh:${row.dataset}:${row.metric}:${row.name}`,
        title: `${row.metric} (${row.dataset.toUpperCase()}${row.period ? ` ${row.period}` : ""})`,
        value: `${row.name} · ${value}`,
        detail: `Field ${row.metric} from GET /api/econ. ${row.unit ? `Unit: ${row.unit}. ` : ""}${row.geo ? `Geo: ${row.geo}. ` : ""}Regional context, not an occupation wage.`,
        source: row.source,
        source_url: row.source_url,
        fetched_at: row.fetched_at,
        empty: false,
        lenses: ["workforce", "parents", "all"],
      })
    );
    if (tiles.length >= 6) break;
  }
  if (tiles.length === 0) {
    tiles.push(
      tile({
        id: "wh:econ-empty",
        title: "Census, BEA, and FRED",
        value: "No data",
        detail:
          snapshot.econ.status === "error"
            ? snapshot.econ.error ?? "GET /api/econ failed."
            : "GET /api/econ returned no numeric census, BEA, or FRED fields.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["workforce", "all"],
      })
    );
  }
  return tiles;
}

export function decisionTiles(snapshot: WarehouseSnapshot, filters: DecisionFilters): DecisionTile[] {
  const tiles: DecisionTile[] = [];
  const programs = filteredPrograms(snapshot, filters);
  const institutions = filteredInstitutions(snapshot, filters);
  const debtRows = programs.filter((row) => row.median_debt != null && row.median_earnings != null);
  if (debtRows.length > 0) {
    const prov = firstProvenance(debtRows);
    const debt = median(debtRows.map((row) => row.median_debt!));
    const earnings = median(debtRows.map((row) => row.median_earnings!));
    tiles.push(
      tile({
        id: "wh:debt-earnings",
        title: "Debt vs median earnings (programs in this response)",
        value: `Debt ${formatUsd(debt!)} · earnings ${formatUsd(earnings!)}`,
        detail: `Median of median_debt and median of median_earnings across ${formatCount(debtRows.length)} program rows that include both fields. This is a summary of the returned rows, not a new survey estimate. Institution / program cost of attendance — not per-course sticker.`,
        ...prov,
        empty: false,
        lenses: ["students", "parents", "counselors", "all"],
      })
    );
  } else {
    tiles.push(
      tile({
        id: "wh:debt-earnings",
        title: "Debt vs median earnings",
        value: "No data",
        detail:
          snapshot.institutions.status === "missing"
            ? "GET /api/institutions is not on this API yet."
            : "No program rows include both median_debt and median_earnings.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["students", "parents", "counselors", "all"],
      })
    );
  }

  const netRows = institutions.filter((row) => row.net_price != null);
  if (netRows.length > 0) {
    const prov = firstProvenance(netRows);
    const value = median(netRows.map((row) => row.net_price!));
    tiles.push(
      tile({
        id: "wh:net-price",
        title: "Net price (institutions in this response)",
        value: formatUsd(value!),
        detail: `Median of net_price across ${formatCount(netRows.length)} institution rows that include the field. Summary of this response, not a national estimate if the endpoint is capped.`,
        ...prov,
        empty: false,
        lenses: ["parents", "all"],
      })
    );
  } else {
    tiles.push(
      tile({
        id: "wh:net-price",
        title: "Net price",
        value: "No data",
        detail:
          snapshot.institutions.status === "missing"
            ? "GET /api/institutions is not on this API yet."
            : "No institution rows include net_price.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["parents", "all"],
      })
    );
  }

  const tuitionRows = institutions.filter((row) => row.tuition_in_state != null);
  if (tuitionRows.length > 0) {
    const prov = firstProvenance(tuitionRows);
    const value = median(tuitionRows.map((row) => row.tuition_in_state!));
    tiles.push(
      tile({
        id: "wh:tuition",
        title: "In-state tuition (institutions in this response)",
        value: formatUsd(value!),
        detail: `Median of tuition_in_state across ${formatCount(tuitionRows.length)} rows with that field. Sticker tuition, not net price.`,
        ...prov,
        empty: false,
        lenses: ["parents", "students", "all"],
      })
    );
  } else {
    tiles.push(
      tile({
        id: "wh:tuition",
        title: "In-state tuition",
        value: "No data",
        detail:
          snapshot.institutions.status === "missing"
            ? "GET /api/institutions is not on this API yet."
            : "No institution rows include tuition_in_state.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["parents", "all"],
      })
    );
  }

  const projections = lineProjections(snapshot.projections.rows).filter((row) => {
    if (filters.channel && occupationChannel(row.change_percent) !== filters.channel) return false;
    return true;
  });
  const growing = projections
    .filter((row) => (row.change_percent ?? 0) > 0)
    .sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0))[0];
  if (growing?.change_percent != null) {
    tiles.push(
      tile({
        id: "wh:growing",
        title: "Fastest growing occupation in this response",
        value: `${growing.occupation_title} · ${formatPct(growing.change_percent)}`,
        detail: `Largest change_percent among detailed projection rows${growing.soc_code ? ` (${growing.soc_code})` : ""}. ${growing.period ?? ""} ${growing.typical_education ? `Typical education: ${growing.typical_education}.` : ""} Published BLS field, not a personal forecast.`,
        source: growing.source || "bls_ep",
        source_url: growing.source_url,
        fetched_at: growing.fetched_at,
        empty: false,
        lenses: ["students", "workforce", "counselors", "all"],
      })
    );
  } else {
    tiles.push(
      tile({
        id: "wh:growing",
        title: "Fastest growing occupation",
        value: "No data",
        detail:
          snapshot.projections.status === "missing"
            ? "GET /api/projections is not on this API yet."
            : "No projection row has a positive change_percent.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["students", "workforce", "counselors", "all"],
      })
    );
  }
  const declining = projections
    .filter((row) => (row.change_percent ?? 0) < 0)
    .sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0))[0];
  if (declining?.change_percent != null) {
    tiles.push(
      tile({
        id: "wh:declining",
        title: "Fastest declining occupation in this response",
        value: `${declining.occupation_title} · ${formatPct(declining.change_percent)}`,
        detail: `Most negative change_percent among detailed projection rows${declining.soc_code ? ` (${declining.soc_code})` : ""}. ${declining.period ?? ""} Published field, not advice to avoid a path.`,
        source: declining.source || "bls_ep",
        source_url: declining.source_url,
        fetched_at: declining.fetched_at,
        empty: false,
        lenses: ["parents", "workforce", "counselors", "all"],
      })
    );
  } else {
    tiles.push(
      tile({
        id: "wh:declining",
        title: "Fastest declining occupation",
        value: "No data",
        detail:
          snapshot.projections.status === "missing"
            ? "GET /api/projections is not on this API yet."
            : "No projection row has a negative change_percent.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["parents", "workforce", "counselors", "all"],
      })
    );
  }

  const sponsors = snapshot.sponsors.rows.filter((row) => stateMatch(row.state, filters.state) && !filters.cip);
  if (snapshot.sponsors.status === "missing") {
    tiles.push(
      tile({
        id: "wh:apprenticeship",
        title: "Registered apprenticeship sponsors",
        value: "No data",
        detail: "GET /api/institutions is not on this API yet, so apprenticeship sponsor rows are unavailable.",
        source: "",
        source_url: null,
        fetched_at: null,
        empty: true,
        lenses: ["students", "counselors", "all"],
      })
    );
  } else {
    const prov = sponsors.length
      ? firstProvenance(sponsors)
      : { source: "", source_url: null, fetched_at: null };
    tiles.push(
      tile({
        id: "wh:apprenticeship",
        title: "Registered apprenticeship sponsors in this response",
        value: snapshot.sponsors.status === "error" ? "No data" : formatCount(sponsors.length),
        detail:
          snapshot.sponsors.status === "error"
            ? snapshot.sponsors.error ?? "Sponsor rows failed to load."
            : sponsors.length === 0
              ? "This institutions payload included no apprenticeship_sponsors rows. A zero here means the list was empty, not an estimated count. Directory rows are not job openings."
              : `Count of sponsor rows returned. Directory rows, not job openings. ${filters.state ? `Filtered to ${filters.state}.` : ""}`,
        ...prov,
        empty: snapshot.sponsors.status === "error",
        lenses: ["students", "counselors", "all"],
      })
    );
  }

  const licenseCount = snapshot.licenses.rows.filter((row) => stateMatch(row.state, filters.state)).length;
  tiles.push(
    endpointCountTile(
      "wh:licenses",
      "Occupational licenses in this response",
      snapshot.licenses,
      licenseCount,
      ["students", "workforce", "counselors", "all"]
    )
  );
  const certCount = snapshot.certifications.rows.filter((row) => stateMatch(row.state, filters.state)).length;
  tiles.push(
    endpointCountTile(
      "wh:certs",
      "Certifications in this response",
      snapshot.certifications,
      certCount,
      ["students", "workforce", "all"]
    )
  );
  const credentialCount = snapshot.credentials.rows.filter(
    (row) => stateMatch(row.state, filters.state) && cipMatch(row.cip_code, row.name, filters.cip)
  ).length;
  tiles.push(
    endpointCountTile(
      "wh:credentials",
      "Credential Engine rows in this response",
      snapshot.credentials,
      credentialCount,
      ["workforce", "counselors", "all"]
    )
  );

  const mix = channelMix(snapshot, filters);
  if (mix.slices.length > 0) {
    tiles.push(
      tile({
        id: "wh:channel-mix",
        title: "Channel mix in this response",
        value: mix.slices.map((slice) => `${slice.channel.replaceAll("_", " ")} ${formatCount(slice.count)}`).join(" · "),
        detail: `${mix.note}${mix.unmapped ? ` ${formatCount(mix.unmapped)} scorecard rows stayed unmapped because no level field matched University or Community College.` : ""}`,
        source: "scorecard",
        source_url: null,
        fetched_at: null,
        empty: false,
        lenses: ["counselors", "all"],
      })
    );
  }

  tiles.push(
    tile({
      id: "wh:cip",
      title: filters.cip ? `Programs matching CIP “${filters.cip}”` : "Programs with a CIP",
      value: snapshot.programs.status === "ok" ? formatCount(programs.length) : "No data",
      detail:
        snapshot.programs.status === "missing"
          ? "GET /api/institutions is not on this API yet."
          : snapshot.programs.rows.length === 0
            ? "This institutions response did not include program CIP rows."
            : "Count of program rows matching the CIP filter (all programs when the filter is empty).",
      source: programs[0]?.source || "",
      source_url: programs[0]?.source_url ?? null,
      fetched_at: programs[0]?.fetched_at ?? null,
      empty: snapshot.programs.status !== "ok" || programs.length === 0,
      lenses: ["counselors", "students", "all"],
    })
  );

  const stated = institutions.filter((row) => row.state);
  tiles.push(
    tile({
      id: "wh:state",
      title: filters.state ? `Institutions matching ${filters.state}` : "Institutions with a state",
      value: snapshot.institutions.status === "ok" ? formatCount(filters.state ? institutions.length : stated.length) : "No data",
      detail:
        snapshot.institutions.status === "missing"
          ? "GET /api/institutions is not on this API yet."
          : "Count of institution rows with a state field, narrowed when a state filter is set.",
      source: institutions[0]?.source || "",
      source_url: institutions[0]?.source_url ?? null,
      fetched_at: institutions[0]?.fetched_at ?? null,
      empty: snapshot.institutions.status !== "ok" || (filters.state ? institutions.length === 0 : stated.length === 0),
      lenses: ["counselors", "parents", "all"],
    })
  );

  tiles.push(...econTiles(snapshot, filters));
  return tiles;
}

function endpointCountTile(
  id: string,
  title: string,
  endpoint: EndpointResult<unknown>,
  count: number,
  lenses: DecisionTile["lenses"]
): DecisionTile {
  if (endpoint.status === "missing") {
    return tile({
      id,
      title,
      value: "No data",
      detail: `GET ${endpoint.path} is not on this API yet.`,
      source: "",
      source_url: null,
      fetched_at: null,
      empty: true,
      lenses,
    });
  }
  if (endpoint.status === "error") {
    return tile({
      id,
      title,
      value: "No data",
      detail: endpoint.error ?? `GET ${endpoint.path} failed.`,
      source: "",
      source_url: null,
      fetched_at: null,
      empty: true,
      lenses,
    });
  }
  const sample = endpoint.rows[0] as Provenance | undefined;
  return tile({
    id,
    title,
    value: formatCount(count),
    detail: `Count of rows returned by GET ${endpoint.path}${count === 0 ? ". The endpoint responded and the list was empty." : "."}`,
    source: sample?.source ?? "",
    source_url: sample?.source_url ?? null,
    fetched_at: sample?.fetched_at ?? null,
    empty: false,
    lenses,
  });
}

export function tilesForLens(tiles: DecisionTile[], lens: AudienceLens | null): DecisionTile[] {
  const key = lens ?? "all";
  const primary = tiles.filter((item) => item.lenses.includes(key));
  const featured = primary.filter((item) => !item.empty);
  const gaps = primary.filter((item) => item.empty);
  if (lens === null) {
    const rest = tiles.filter((item) => !primary.includes(item) && !item.empty);
    return [...featured, ...rest, ...gaps];
  }
  const also = tiles.filter((item) => !item.lenses.includes(key) && !item.empty);
  return [...featured, ...gaps, ...also];
}

export function tilesToInsights(tiles: DecisionTile[]): InsightRow[] {
  const now = new Date(0).toISOString();
  return tiles.map((item) => ({
    id: item.id,
    title: item.title,
    value: item.value,
    detail: item.detail,
    source: item.source || (item.empty ? "unknown" : item.source),
    source_url: item.source_url,
    fetched_at: item.fetched_at,
    created_at: item.fetched_at ?? now,
    updated_at: item.fetched_at ?? now,
  }));
}

export function mergeInsightRows(apiRows: InsightRow[], derived: InsightRow[]): InsightRow[] {
  const seen = new Set(apiRows.map((row) => row.title.trim().toLowerCase()));
  const extra = derived.filter((row) => !seen.has(row.title.trim().toLowerCase()));
  return [...apiRows, ...extra];
}

export const LENS_DECISIONS: Record<AudienceLens | "all", string> = {
  all: "Which path has cost, earnings, and outlook evidence in this pull — and where is the warehouse still empty?",
  students:
    "Compare college cost with field earnings, then apprenticeships, growing fields, and the licenses or certs that sit on the path.",
  parents:
    "Net price and in-state tuition, debt next to median earnings, and occupations whose published projection is declining.",
  counselors:
    "Filter by channel, CIP or program, state, and outlook. Counts below are rows in this response, not a complete national file unless the API says so.",
  workforce:
    "Growing and declining SOC codes, Census / BEA / FRED context, and credential supply returned by this API.",
};

export type FeedCard = {
  id: string;
  label: string;
  live: boolean;
  fetchedAt: string | null;
  sourceUrl: string | null;
  homeUrl: string;
  count: number | null;
  note: string;
};

export type FeedStrip = {
  cards: FeedCard[];
  detail: string;
};

const FEED_CATALOG: Array<{ id: string; label: string; sources: string[]; homeUrl: string }> = [
  { id: "scorecard", label: "Scorecard", sources: ["scorecard"], homeUrl: "https://collegescorecard.ed.gov/data/" },
  { id: "oews", label: "OEWS", sources: ["bls"], homeUrl: "https://www.bls.gov/oes/" },
  { id: "bls_ep", label: "BLS EP", sources: ["bls_ep"], homeUrl: "https://www.bls.gov/emp/tables.htm" },
  { id: "onet", label: "O*NET", sources: ["onet"], homeUrl: "https://www.onetcenter.org/database.html" },
  { id: "apprenticeship_gov", label: "apprenticeship.gov", sources: ["apprenticeship_gov"], homeUrl: "https://www.apprenticeship.gov/data-and-statistics" },
  {
    id: "careeronestop",
    label: "CareerOneStop",
    sources: ["careeronestop"],
    homeUrl: "https://www.careeronestop.org/Developers/WebAPI/web-api.aspx",
  },
  { id: "census", label: "Census", sources: ["census"], homeUrl: "https://www.census.gov/data/developers/data-sets/acs-5year.html" },
  { id: "bea", label: "BEA", sources: ["bea"], homeUrl: "https://apps.bea.gov/API/docs/index.htm" },
  { id: "fred", label: "FRED", sources: ["fred"], homeUrl: "https://fred.stlouisfed.org/docs/api/fred/" },
  {
    id: "credential_engine",
    label: "Credential Engine",
    sources: ["credential_engine", "ctdl"],
    homeUrl: "https://credentialengine.org/",
  },
];

function latestStamp(rows: Provenance[]): { fetched_at: string | null; source_url: string | null; count: number } {
  let fetched_at: string | null = null;
  let source_url: string | null = null;
  for (const row of rows) {
    if (row.fetched_at && (!fetched_at || row.fetched_at > fetched_at)) fetched_at = row.fetched_at;
    if (!source_url && row.source_url) source_url = row.source_url;
  }
  return { fetched_at, source_url, count: rows.length };
}

function matchFeed(feeds: ApiFeed[], catalogId: string, sources: string[]): ApiFeed | null {
  const keys = new Set([catalogId, ...sources]);
  return (
    feeds.find((feed) => {
      const id = feed.id.toLowerCase();
      const source = (feed.source ?? "").toLowerCase();
      return keys.has(id) || keys.has(source);
    }) ?? null
  );
}

export function buildFeedStrip(
  snapshot: WarehouseSnapshot,
  opts: {
    latestFetchedAt?: string | null;
    events?: Array<{ source?: string | null; source_url?: string | null; fetched_at?: string | null }>;
  } = {}
): FeedStrip {
  const evidence = new Map<string, Provenance[]>();
  const add = (source: string, row: Provenance) => {
    const list = evidence.get(source) ?? [];
    list.push(row);
    evidence.set(source, list);
  };
  for (const row of snapshot.institutions.rows) add(row.source || "scorecard", row);
  for (const row of snapshot.programs.rows) add(row.source || "scorecard", row);
  for (const row of snapshot.sponsors.rows) add(row.source || "apprenticeship_gov", row);
  for (const row of snapshot.wages.rows) add(row.source || "bls", row);
  for (const row of snapshot.projections.rows) add(row.source || "bls_ep", row);
  for (const row of snapshot.credentials.rows) if (row.source) add(row.source, row);
  for (const row of snapshot.licenses.rows) add(row.source || "careeronestop", row);
  for (const row of snapshot.certifications.rows) add(row.source || "careeronestop", row);
  for (const row of snapshot.econ.rows) add(row.source || row.dataset, row);
  for (const event of opts.events ?? []) {
    if (!event.source) continue;
    add(event.source, {
      source: event.source,
      source_url: event.source_url ?? null,
      fetched_at: event.fetched_at ?? null,
    });
  }

  const cards = FEED_CATALOG.map((catalog) => {
    const api = snapshot.feeds.status === "ok" ? matchFeed(snapshot.feeds.rows, catalog.id, catalog.sources) : null;
    const rows = catalog.sources.flatMap((source) => evidence.get(source) ?? []);
    const fromRows = latestStamp(rows);
    const fetchedAt = api?.fetched_at ?? fromRows.fetched_at;
    const sourceUrl = api?.source_url ?? fromRows.source_url;
    const count = api?.count ?? (rows.length > 0 ? rows.length : null);
    const live = Boolean(fetchedAt);
    let note = "Not pulled yet.";
    if (live) note = "Last pulled. Periodic government release, not a live tick.";
    else if (snapshot.feeds.status === "missing" && rows.length === 0) note = "This API has not reported a pull for this dataset.";
    else if (rows.length > 0 && !fetchedAt) note = "Rows returned without fetched_at.";
    if (catalog.id === "credential_engine" && !live) {
      note = "Not pulled. Credential Engine stays dark until GET /api/credentials or GET /api/feeds reports fetched_at. CareerOneStop certifications are a separate card.";
    }
    return {
      id: catalog.id,
      label: api?.label || catalog.label,
      live,
      fetchedAt,
      sourceUrl,
      homeUrl: catalog.homeUrl,
      count,
      note,
    } satisfies FeedCard;
  });

  let detail =
    "Last pulled times come from the API. These feeds are annual or periodic government releases, not tick-by-tick.";
  if (snapshot.feeds.status === "missing") {
    detail += " GET /api/feeds is not on this API; times below are taken from warehouse rows and events when those responses include fetched_at.";
  } else if (snapshot.feeds.status === "error" && snapshot.feeds.error) {
    detail += ` ${snapshot.feeds.error}`;
  }
  if (opts.latestFetchedAt && cards.every((card) => !card.fetchedAt)) {
    detail += ` GET /api/meta reports warehouse latest_fetched_at ${opts.latestFetchedAt}, not broken out by dataset.`;
  }
  return { cards, detail };
}

export function warehouseGaps(snapshot: WarehouseSnapshot): string[] {
  const gaps: string[] = [];
  const seen = new Set<string>();
  for (const endpoint of [
    snapshot.institutions,
    snapshot.wages,
    snapshot.projections,
    snapshot.credentials,
    snapshot.licenses,
    snapshot.certifications,
    snapshot.econ,
    snapshot.feeds,
  ]) {
    if (seen.has(endpoint.path)) continue;
    seen.add(endpoint.path);
    if (endpoint.status === "missing") gaps.push(`${endpoint.path} is not on this API yet.`);
    else if (endpoint.status === "error" && endpoint.error) gaps.push(endpoint.error);
  }
  return gaps;
}

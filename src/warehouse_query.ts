import { CHANNELS } from "./events_validate";
import { LIVE_SOURCES } from "./live_sources";
import {
  BEA_API_DOCS,
  BLS_EP_TABLE_URL,
  BLS_OEWS_TABLES,
  CAREERONESTOP_LICENSE_DOCS,
  CENSUS_ACS5_DOCS,
  FRED_SERIES_DOCS,
  ONET_DATABASE_HOME,
  SCORECARD_DATA_HOME,
} from "./ingest/urls";

export const WAREHOUSE_DEFAULT_LIMIT = 50;
export const WAREHOUSE_MAX_LIMIT = 200;
export const WAREHOUSE_MAX_OFFSET = 100_000;
export const WAREHOUSE_MAX_Q = 200;

export const WAREHOUSE_RESOURCES = [
  "institutions",
  "programs",
  "sponsors",
  "occupations",
  "wages",
  "projections",
  "credentials",
  "licenses",
  "certifications",
  "econ",
] as const;

export type WarehouseResource = (typeof WAREHOUSE_RESOURCES)[number];

/** Public list key. Econ stays `econ` so the path and body match. */
export function warehouseBodyKey(resource: WarehouseResource): string {
  return resource;
}

export const WAREHOUSE_SOURCE_SET = new Set<string>([
  ...LIVE_SOURCES,
  "credential_engine",
]);

export type WarehouseListQuery = {
  limit: number;
  offset: number;
  q?: string;
  state?: string;
  /** Stored type column: control, credential level, area type, and similar. */
  type?: string;
  channel?: string;
  soc?: string;
  outlook?: "grow" | "decline";
  source?: string;
  cip?: string;
};

export type WarehousePage = {
  rows: Record<string, unknown>[];
  limit: number;
  offset: number;
  total: number;
};

export type FeedCadence = "daily" | "weekly" | "release";
export type FeedStatus = "ok" | "stale" | "error";

export type FeedRow = {
  source: string;
  label: string;
  cadence: FeedCadence;
  cadence_label: string;
  source_url: string;
  last_fetched_at: string | null;
  rows: number;
  row_counts: Record<string, number>;
  status: FeedStatus;
};

export type FeedSnapshot = {
  rows: number;
  last_fetched_at: string | null;
  row_counts: Record<string, number>;
};

/** Pull-failure windows. Cadence labels describe the dataset, not a tick stream. */
export const FEED_STALE_MS: Record<FeedCadence, number> = {
  daily: 72 * 60 * 60 * 1000,
  weekly: 10 * 24 * 60 * 60 * 1000,
  release: 14 * 24 * 60 * 60 * 1000,
};

const RELEASE_PULLED =
  "Release-driven. Still pulled on the ingest schedule so fetched_at stays current. Not a tick-by-tick feed.";

export const FEED_CATALOG: readonly {
  source: string;
  label: string;
  cadence: FeedCadence;
  cadence_label: string;
  source_url: string;
}[] = [
  {
    source: "scorecard",
    label: "College Scorecard",
    cadence: "release",
    cadence_label: `Institution and field-of-study files. ${RELEASE_PULLED}`,
    source_url: SCORECARD_DATA_HOME,
  },
  {
    source: "bls",
    label: "BLS OEWS",
    cadence: "release",
    cadence_label: `OEWS wage tables publish on a release calendar. ${RELEASE_PULLED} This warehouse does not treat OEWS as a daily BLS time series.`,
    source_url: BLS_OEWS_TABLES,
  },
  {
    source: "bls_ep",
    label: "BLS Employment Projections",
    cadence: "release",
    cadence_label: `Employment Projections (source bls_ep, 2025–2035 vintage in this warehouse). ${RELEASE_PULLED}`,
    source_url: BLS_EP_TABLE_URL,
  },
  {
    source: "onet",
    label: "O*NET",
    cadence: "release",
    cadence_label: `O*NET occupation database. ${RELEASE_PULLED}`,
    source_url: ONET_DATABASE_HOME,
  },
  {
    source: "apprenticeship_gov",
    label: "Apprenticeship.gov",
    cadence: "weekly",
    cadence_label:
      "Weekly sponsor CSV. Pulled on the ingest schedule so fetched_at stays current. Not a tick-by-tick feed.",
    source_url: "https://www.apprenticeship.gov/",
  },
  {
    source: "careeronestop",
    label: "CareerOneStop",
    cadence: "weekly",
    cadence_label:
      "Weekly. Licenses and certifications are refreshed on a weekly cadence, not tick-by-tick.",
    source_url: CAREERONESTOP_LICENSE_DOCS,
  },
  {
    source: "census",
    label: "Census ACS",
    cadence: "release",
    cadence_label: `ACS 5-year tables. ${RELEASE_PULLED}`,
    source_url: CENSUS_ACS5_DOCS,
  },
  {
    source: "bea",
    label: "BEA Regional",
    cadence: "release",
    cadence_label: `Regional GDP and personal income. ${RELEASE_PULLED}`,
    source_url: BEA_API_DOCS,
  },
  {
    source: "fred",
    label: "FRED",
    cadence: "daily",
    cadence_label:
      "Daily-ish. FRED series such as UNRATE and CPIAUCSL are pulled for the latest published observation, not a tick stream.",
    source_url: FRED_SERIES_DOCS,
  },
  {
    source: "credential_engine",
    label: "Credential Engine",
    cadence: "release",
    cadence_label:
      "Release-driven registry snapshot already in the warehouse. GET reads those rows and does not call Credential Engine.",
    source_url: "https://credentialengine.org/",
  },
];

export function feedStatus(
  lastFetchedAt: string | null,
  cadence: FeedCadence,
  now = Date.now()
): FeedStatus {
  if (!lastFetchedAt) return "error";
  const at = Date.parse(lastFetchedAt);
  if (!Number.isFinite(at)) return "error";
  const age = now - at;
  if (age < 0) return "ok";
  return age <= FEED_STALE_MS[cadence] ? "ok" : "stale";
}

export function buildFeedRows(
  snapshots: Partial<Record<string, FeedSnapshot>>,
  now = Date.now()
): FeedRow[] {
  return FEED_CATALOG.map((feed) => {
    const snap = snapshots[feed.source];
    const last = snap?.last_fetched_at ?? null;
    const rows = snap?.rows ?? 0;
    return {
      source: feed.source,
      label: feed.label,
      cadence: feed.cadence,
      cadence_label: feed.cadence_label,
      source_url: feed.source_url,
      last_fetched_at: last,
      rows,
      row_counts: snap?.row_counts ?? {},
      status: rows === 0 && !last ? "error" : feedStatus(last, feed.cadence, now),
    };
  });
}

export function warehouseListBody(
  resource: WarehouseResource,
  page: WarehousePage
): Record<string, unknown> {
  return {
    [warehouseBodyKey(resource)]: page.rows,
    limit: page.limit,
    offset: page.offset,
    total: page.total,
  };
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  return text.length ? text : undefined;
}

export function likeContains(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function parseWarehouseListQuery(
  query: unknown
):
  | { ok: true; value: WarehouseListQuery }
  | { ok: false; details: { field: string; rule: string }[] } {
  const rec =
    query !== null && typeof query === "object" && !Array.isArray(query)
      ? (query as Record<string, unknown>)
      : {};
  const details: { field: string; rule: string }[] = [];

  let limit = WAREHOUSE_DEFAULT_LIMIT;
  const rawLimit = firstQueryValue(rec.limit);
  if (rawLimit !== undefined && rawLimit.length > 0) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) {
      details.push({ field: "limit", rule: "integer_range" });
    } else {
      limit = Math.min(n, WAREHOUSE_MAX_LIMIT);
    }
  }

  let offset = 0;
  const rawOffset = firstQueryValue(rec.offset);
  if (rawOffset !== undefined && rawOffset.length > 0) {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0 || n > WAREHOUSE_MAX_OFFSET) {
      details.push({ field: "offset", rule: "integer_range" });
    } else {
      offset = n;
    }
  }

  const q = trimmed(firstQueryValue(rec.q));
  if (q !== undefined && q.length > WAREHOUSE_MAX_Q) {
    details.push({ field: "q", rule: "length" });
  }

  const state = trimmed(firstQueryValue(rec.state));
  if (state !== undefined && (state.length > 64 || /[\u0000-\u001f]/.test(state))) {
    details.push({ field: "state", rule: "length" });
  }

  const type = trimmed(firstQueryValue(rec.type));
  if (type !== undefined && (type.length > 80 || /[\u0000-\u001f]/.test(type))) {
    details.push({ field: "type", rule: "length" });
  }

  const channel = trimmed(firstQueryValue(rec.channel));
  if (channel !== undefined && !CHANNELS.has(channel)) {
    details.push({ field: "channel", rule: "enum" });
  }

  const soc = trimmed(firstQueryValue(rec.soc));
  if (soc !== undefined && !/^[0-9A-Za-z.-]{2,16}$/.test(soc)) {
    details.push({ field: "soc", rule: "format" });
  }

  const rawOutlook = trimmed(firstQueryValue(rec.outlook));
  let outlook: "grow" | "decline" | undefined;
  if (rawOutlook !== undefined) {
    if (rawOutlook !== "grow" && rawOutlook !== "decline") {
      details.push({ field: "outlook", rule: "enum" });
    } else {
      outlook = rawOutlook;
    }
  }

  const source = trimmed(firstQueryValue(rec.source));
  if (source !== undefined && !WAREHOUSE_SOURCE_SET.has(source)) {
    details.push({ field: "source", rule: "enum" });
  }

  const cip = trimmed(firstQueryValue(rec.cip));
  if (cip !== undefined && !/^[0-9A-Za-z.]{1,32}$/.test(cip)) {
    details.push({ field: "cip", rule: "format" });
  }

  if (details.length) return { ok: false, details };
  const value: WarehouseListQuery = { limit, offset };
  if (q) value.q = q;
  if (state) value.state = state;
  if (type) value.type = type;
  if (channel) value.channel = channel;
  if (soc) value.soc = soc;
  if (outlook) value.outlook = outlook;
  if (source) value.source = source;
  if (cip) value.cip = cip;
  return { ok: true, value };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function includes(value: unknown, needle: string): boolean {
  return text(value).toLowerCase().includes(needle.toLowerCase());
}

function same(value: unknown, needle: string): boolean {
  return text(value).toLowerCase() === needle.toLowerCase();
}

function socHit(value: unknown, soc: string): boolean {
  const norm = (raw: string) => raw.toLowerCase().replace(/\.00$/, "");
  const hay = norm(text(value));
  const needle = norm(soc);
  return hay.length > 0 && (hay === needle || hay.startsWith(needle));
}

function cipHit(code: unknown, title: unknown, cip: string): boolean {
  const squash = (raw: string) => raw.toLowerCase().replace(/\./g, "");
  const needle = squash(cip);
  const hay = squash(text(code));
  if (needle && hay.startsWith(needle)) return true;
  return includes(title, cip);
}

function channelAllows(resource: WarehouseResource, channel: string): boolean {
  if (resource === "institutions" || resource === "programs") {
    return channel === "university" || channel === "community_college";
  }
  if (resource === "sponsors") return channel === "apprenticeship";
  return true;
}

/** In-memory twin of the SQL filters. Inapplicable filters are ignored, not errors. */
export function matchesWarehouseRow(
  resource: WarehouseResource,
  row: Record<string, unknown>,
  query: WarehouseListQuery
): boolean {
  if (query.source && !same(row.source, query.source)) return false;
  if (query.channel && !channelAllows(resource, query.channel)) return false;
  if (query.state) {
    if (resource === "wages") {
      if (!same(row.area_code, query.state) && !same(row.area_name, query.state)) return false;
    } else if (resource === "econ") {
      if (!same(row.geo_id, query.state) && !same(row.geo_name, query.state)) return false;
    } else if (
      resource === "institutions" ||
      resource === "programs" ||
      resource === "sponsors" ||
      resource === "credentials" ||
      resource === "licenses"
    ) {
      if (!same(row.state, query.state)) return false;
    }
  }
  if (query.type) {
    const field =
      resource === "institutions"
        ? "control"
        : resource === "programs"
          ? "credential_level"
          : resource === "sponsors"
            ? "organization_type"
            : resource === "wages"
              ? "area_type"
              : resource === "projections"
                ? "typical_education"
                : resource === "credentials"
                  ? "credential_type"
                  : resource === "certifications"
                    ? "cert_type"
                    : null;
    if (field && !same(row[field], query.type)) return false;
  }
  if (query.soc) {
    const field =
      resource === "occupations"
        ? "onet_soc"
        : resource === "wages" || resource === "projections"
          ? "soc_code"
          : resource === "credentials"
            ? "occupation_code"
            : null;
    if (field && !socHit(row[field], query.soc)) return false;
  }
  if (query.outlook && resource === "projections") {
    const change = typeof row.change_percent === "number" ? row.change_percent : Number(row.change_percent);
    if (query.outlook === "grow" && !(change > 0)) return false;
    if (query.outlook === "decline" && !(change < 0)) return false;
  }
  if (query.cip && resource === "programs" && !cipHit(row.cip_code, row.cip_title, query.cip)) {
    return false;
  }
  if (query.cip && resource === "credentials" && !cipHit(row.cip_code, row.name, query.cip)) {
    return false;
  }
  if (query.q) {
    const fields =
      resource === "institutions"
        ? ["name", "city", "unitid"]
        : resource === "programs"
          ? ["institution_name", "cip_title", "cip_code", "credential_title"]
          : resource === "sponsors"
            ? ["name", "city", "county"]
            : resource === "occupations"
              ? ["title", "description", "onet_soc"]
              : resource === "wages"
                ? ["occupation_title", "area_name", "soc_code"]
                : resource === "projections"
                  ? ["occupation_title", "soc_code", "typical_education"]
                  : resource === "credentials"
                    ? ["name", "organization", "description", "credential_id"]
                    : resource === "licenses"
                      ? ["title", "agency_name", "license_id"]
                      : resource === "certifications"
                        ? ["name", "organization", "cert_id"]
                        : ["title", "series_id", "geo_name"];
    if (!fields.some((field) => includes(row[field], query.q ?? ""))) return false;
  }
  return true;
}

function cmpText(a: unknown, b: unknown): number {
  return text(a).localeCompare(text(b));
}

export function compareWarehouseRows(
  resource: WarehouseResource,
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  if (resource === "projections") {
    const an = typeof a.change_percent === "number" ? a.change_percent : null;
    const bn = typeof b.change_percent === "number" ? b.change_percent : null;
    if (an == null && bn != null) return 1;
    if (an != null && bn == null) return -1;
    if (an != null && bn != null && an !== bn) return bn - an;
    const byTitle = cmpText(a.occupation_title, b.occupation_title);
    return byTitle !== 0 ? byTitle : cmpText(a.id, b.id);
  }
  if (resource === "econ") {
    const byPeriod = cmpText(b.period, a.period);
    if (byPeriod !== 0) return byPeriod;
    const byTitle = cmpText(a.title, b.title);
    return byTitle !== 0 ? byTitle : cmpText(a.id, b.id);
  }
  const pairs: [string, string][] =
    resource === "institutions"
      ? [
          ["name", "name"],
          ["unitid", "unitid"],
        ]
      : resource === "programs"
        ? [
            ["institution_name", "institution_name"],
            ["cip_code", "cip_code"],
            ["id", "id"],
          ]
        : resource === "sponsors"
          ? [
              ["name", "name"],
              ["sponsor_key", "sponsor_key"],
            ]
          : resource === "occupations"
            ? [
                ["title", "title"],
                ["onet_soc", "onet_soc"],
              ]
            : resource === "wages"
              ? [
                  ["occupation_title", "occupation_title"],
                  ["area_code", "area_code"],
                  ["id", "id"],
                ]
              : resource === "credentials"
                ? [
                    ["name", "name"],
                    ["credential_id", "credential_id"],
                  ]
                : resource === "licenses"
                  ? [
                      ["title", "title"],
                      ["license_id", "license_id"],
                    ]
                  : [
                      ["name", "name"],
                      ["cert_id", "cert_id"],
                    ];
  for (const [left, right] of pairs) {
    const diff = cmpText(a[left], b[right]);
    if (diff !== 0) return diff;
  }
  return 0;
}

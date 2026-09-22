import type { Pool } from "pg";
import type { LicenseRecord, CertificationRecord } from "./adapters/careeronestop";
import { isUndefinedColumnError } from "../db";
import {
  buildFeedRows,
  likeContains,
  type FeedRow,
  type FeedSnapshot,
  type WarehouseListQuery,
  type WarehousePage,
  type WarehouseResource,
} from "../warehouse_query";

const CHUNK = 200;

export type EconIndicatorRecord = {
  series_id: string;
  title: string;
  geo_id: string;
  geo_name: string | null;
  period: string;
  value: number | null;
  unit: string | null;
  source: "census" | "bea" | "fred";
  source_url: string;
  fetched_at: string;
};

export function isMissingRelation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: string }).code === "42P01";
}

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function flag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "t" || value === "true" || value === 1) return true;
  if (value === "f" || value === "false" || value === 0) return false;
  return null;
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("unexpected column");
  }
  return `"${name}"`;
}

async function countOf(pool: Pool, table: string): Promise<number> {
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table}`
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    if (isMissingRelation(err)) return 0;
    throw err;
  }
}

async function maxFetched(pool: Pool, table: string): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ fetched_at: Date | string | null }>(
      `SELECT max(fetched_at) AS fetched_at FROM ${table}`
    );
    return iso(rows[0]?.fetched_at ?? null);
  } catch (err) {
    if (isMissingRelation(err) || isUndefinedColumnError(err)) return null;
    throw err;
  }
}

async function sourceSnapshot(
  pool: Pool,
  table: string,
  source: string | null
): Promise<{ rows: number; last: string | null }> {
  try {
    const { rows } = await pool.query<{ n: string; fetched_at: Date | string | null }>(
      source
        ? `SELECT count(*)::text AS n, max(fetched_at) AS fetched_at FROM ${table} WHERE source = $1`
        : `SELECT count(*)::text AS n, max(fetched_at) AS fetched_at FROM ${table}`,
      source ? [source] : []
    );
    return { rows: Number(rows[0]?.n ?? 0), last: iso(rows[0]?.fetched_at ?? null) };
  } catch (err) {
    if (isMissingRelation(err) || isUndefinedColumnError(err)) return { rows: 0, last: null };
    throw err;
  }
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export async function readWarehouseStats(pool: Pool): Promise<{
  institutions: number;
  programs: number;
  apprenticeship_sponsors: number;
  occupations: number;
  wage_observations: number;
  projections: number;
  credentials: number;
  licenses: number;
  certifications: number;
  econ_indicators: number;
  latest_fetched_at: string | null;
}> {
  const [
    institutions,
    programs,
    apprenticeship_sponsors,
    occupations,
    wage_observations,
    projections,
    credentials,
    licenses,
    certifications,
    econ_indicators,
  ] = await Promise.all([
    countOf(pool, "institutions"),
    countOf(pool, "programs"),
    countOf(pool, "apprenticeship_sponsors"),
    countOf(pool, "occupations"),
    countOf(pool, "wage_observations"),
    countOf(pool, "projections"),
    countOf(pool, "credentials"),
    countOf(pool, "licenses"),
    countOf(pool, "certifications"),
    countOf(pool, "econ_indicators"),
  ]);
  const fetched = await Promise.all(
    [
      "institutions",
      "programs",
      "apprenticeship_sponsors",
      "occupations",
      "wage_observations",
      "projections",
      "credentials",
      "licenses",
      "certifications",
      "econ_indicators",
    ].map((table) => maxFetched(pool, table))
  );
  return {
    institutions,
    programs,
    apprenticeship_sponsors,
    occupations,
    wage_observations,
    projections,
    credentials,
    licenses,
    certifications,
    econ_indicators,
    latest_fetched_at: fetched.reduce<string | null>((acc, value) => later(acc, value), null),
  };
}

export async function readWarehouseFeeds(pool: Pool, now = Date.now()): Promise<FeedRow[]> {
  const [
    institutions,
    programs,
    sponsors,
    occupations,
    blsWages,
    cosWages,
    projections,
    licenses,
    certifications,
    credentials,
    census,
    bea,
    fred,
  ] = await Promise.all([
    sourceSnapshot(pool, "institutions", "scorecard"),
    sourceSnapshot(pool, "programs", "scorecard"),
    sourceSnapshot(pool, "apprenticeship_sponsors", "apprenticeship_gov"),
    sourceSnapshot(pool, "occupations", "onet"),
    sourceSnapshot(pool, "wage_observations", "bls"),
    sourceSnapshot(pool, "wage_observations", "careeronestop"),
    sourceSnapshot(pool, "projections", "bls_ep"),
    sourceSnapshot(pool, "licenses", null),
    sourceSnapshot(pool, "certifications", null),
    sourceSnapshot(pool, "credentials", null),
    sourceSnapshot(pool, "econ_indicators", "census"),
    sourceSnapshot(pool, "econ_indicators", "bea"),
    sourceSnapshot(pool, "econ_indicators", "fred"),
  ]);

  const snap = (
    parts: { key: string; rows: number; last: string | null }[]
  ): FeedSnapshot => {
    const row_counts: Record<string, number> = {};
    let rows = 0;
    let last: string | null = null;
    for (const part of parts) {
      row_counts[part.key] = part.rows;
      rows += part.rows;
      last = later(last, part.last);
    }
    return { rows, last_fetched_at: last, row_counts };
  };

  const snapshots: Record<string, FeedSnapshot> = {
    scorecard: snap([
      { key: "institutions", ...institutions },
      { key: "programs", ...programs },
    ]),
    bls: snap([{ key: "wage_observations", ...blsWages }]),
    bls_ep: snap([{ key: "projections", ...projections }]),
    onet: snap([{ key: "occupations", ...occupations }]),
    apprenticeship_gov: snap([{ key: "apprenticeship_sponsors", ...sponsors }]),
    careeronestop: snap([
      { key: "licenses", ...licenses },
      { key: "certifications", ...certifications },
      { key: "wages", ...cosWages },
    ]),
    census: snap([{ key: "econ_indicators", ...census }]),
    bea: snap([{ key: "econ_indicators", ...bea }]),
    fred: snap([{ key: "econ_indicators", ...fred }]),
    credential_engine: snap([{ key: "credentials", ...credentials }]),
  };
  return buildFeedRows(snapshots, now);
}

type SqlFilter = { clause: string; values: unknown[] };

function andWhere(parts: string[]): string {
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

async function runPaged(
  pool: Pool,
  selectList: string,
  fromSql: string,
  filter: SqlFilter,
  orderSql: string,
  limit: number,
  offset: number,
  map: (row: Record<string, unknown>) => Record<string, unknown>
): Promise<WarehousePage> {
  const where = andWhere(filter.clause ? [filter.clause] : []);
  const count = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${fromSql} ${where}`,
    filter.values
  );
  const limitAt = filter.values.length + 1;
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT ${selectList} FROM ${fromSql} ${where} ${orderSql} LIMIT $${limitAt} OFFSET $${limitAt + 1}`,
    [...filter.values, limit, offset]
  );
  return {
    rows: rows.map((row) => map(row)),
    limit,
    offset,
    total: Number(count.rows[0]?.n ?? 0),
  };
}

function whereParts(parts: string[], values: unknown[]): SqlFilter {
  return { clause: parts.join(" AND "), values };
}

function qClause(columns: string[], q: string, values: unknown[]): string {
  values.push(likeContains(q));
  const idx = values.length;
  return `(${columns.map((column) => `${column} ILIKE $${idx} ESCAPE '\\'`).join(" OR ")})`;
}

function socClause(column: string, soc: string, values: unknown[]): string {
  values.push(soc.replace(/\.00$/i, "").toLowerCase());
  return `REPLACE(LOWER(${column}), '.00', '') LIKE $${values.length} || '%'`;
}

function coreList(
  pool: Pool,
  fromSql: string,
  filter: SqlFilter,
  orderSql: string,
  query: WarehouseListQuery,
  map: (row: Record<string, unknown>) => Record<string, unknown>,
  selectList = "*"
): Promise<WarehousePage> {
  return runPaged(pool, selectList, fromSql, filter, orderSql, query.limit, query.offset, map);
}

function provenance(row: Record<string, unknown>): {
  source: string | null;
  source_url: string | null;
  fetched_at: string | null;
} {
  return {
    source: str(row.source),
    source_url: str(row.source_url),
    fetched_at: iso(row.fetched_at),
  };
}

function mapInstitution(row: Record<string, unknown>): Record<string, unknown> {
  return {
    unitid: str(row.unitid),
    name: str(row.name),
    city: str(row.city),
    state: str(row.state),
    control: str(row.control),
    operating: flag(row.operating),
    tuition_in_state: num(row.tuition_in_state),
    tuition_out_state: num(row.tuition_out_state),
    net_price: num(row.net_price),
    median_earnings: num(row.median_earnings),
    ...provenance(row),
  };
}

function mapProgram(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: str(row.id),
    institution_unitid: str(row.institution_unitid),
    institution_name: str(row.institution_name),
    state: str(row.state),
    cip_code: str(row.cip_code),
    cip_title: str(row.cip_title),
    credential_level: str(row.credential_level),
    credential_title: str(row.credential_title),
    median_earnings: num(row.median_earnings),
    median_debt: num(row.median_debt),
    ...provenance(row),
  };
}

function mapSponsor(row: Record<string, unknown>): Record<string, unknown> {
  return {
    sponsor_key: str(row.sponsor_key),
    name: str(row.name),
    organization_type: str(row.organization_type),
    website: str(row.website),
    city: str(row.city),
    state: str(row.state),
    zip: str(row.zip),
    county: str(row.county),
    registered_at: iso(row.registered_at),
    ...provenance(row),
  };
}

function mapOccupation(row: Record<string, unknown>): Record<string, unknown> {
  return {
    onet_soc: str(row.onet_soc),
    title: str(row.title),
    description: str(row.description),
    ...provenance(row),
  };
}

function mapWage(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: str(row.id),
    soc_code: str(row.soc_code),
    occupation_title: str(row.occupation_title),
    area_code: str(row.area_code),
    area_name: str(row.area_name),
    area_type: str(row.area_type),
    period: str(row.period),
    employment: num(row.employment),
    mean_annual_wage: num(row.mean_annual_wage),
    median_annual_wage: num(row.median_annual_wage),
    mean_hourly_wage: num(row.mean_hourly_wage),
    median_hourly_wage: num(row.median_hourly_wage),
    ...provenance(row),
  };
}

function mapProjection(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: str(row.id),
    soc_code: str(row.soc_code),
    occupation_title: str(row.occupation_title),
    period: str(row.period),
    employment_base: num(row.employment_base),
    employment_proj: num(row.employment_proj),
    change_percent: num(row.change_percent),
    typical_education: str(row.typical_education),
    ...provenance(row),
  };
}

function pushEq(parts: string[], values: unknown[], column: string, value: string | undefined): void {
  if (!value) return;
  values.push(value);
  parts.push(`LOWER(${column}) = LOWER($${values.length})`);
}

function pushSource(parts: string[], values: unknown[], source: string | undefined, column = "source"): void {
  if (!source) return;
  values.push(source);
  parts.push(`${column} = $${values.length}`);
}

export async function readWarehouseList(
  pool: Pool,
  resource: WarehouseResource,
  query: WarehouseListQuery
): Promise<WarehousePage> {
  if (
    resource === "credentials" ||
    resource === "licenses" ||
    resource === "certifications" ||
    resource === "econ"
  ) {
    return readFlexible(pool, resource, query);
  }
  return readCore(pool, resource, query);
}

async function readCore(
  pool: Pool,
  resource: Exclude<WarehouseResource, "credentials" | "licenses" | "certifications" | "econ">,
  query: WarehouseListQuery
): Promise<WarehousePage> {
  const parts: string[] = [];
  const values: unknown[] = [];

  if (resource === "institutions") {
    pushEq(parts, values, "state", query.state);
    pushEq(parts, values, "control", query.type);
    pushSource(parts, values, query.source);
    if (query.channel) {
      values.push(query.channel);
      parts.push(`$${values.length} IN ('university', 'community_college')`);
    }
    if (query.q) parts.push(qClause(["name", "city", "unitid"], query.q, values));
    return coreList(
      pool,
      "institutions",
      whereParts(parts, values),
      "ORDER BY name ASC, unitid ASC",
      query,
      mapInstitution
    );
  }

  if (resource === "programs") {
    pushEq(parts, values, "i.state", query.state);
    pushEq(parts, values, "p.credential_level", query.type);
    pushSource(parts, values, query.source, "p.source");
    if (query.channel) {
      values.push(query.channel);
      parts.push(`$${values.length} IN ('university', 'community_college')`);
    }
    if (query.cip) {
      values.push(query.cip.replace(/\./g, "").toLowerCase());
      const cipIdx = values.length;
      values.push(likeContains(query.cip));
      const likeIdx = values.length;
      parts.push(
        `(REPLACE(LOWER(p.cip_code), '.', '') LIKE $${cipIdx} || '%' OR p.cip_title ILIKE $${likeIdx} ESCAPE '\\')`
      );
    }
    if (query.q) {
      parts.push(
        qClause(
          ["p.institution_name", "p.cip_title", "p.cip_code", "p.credential_title"],
          query.q,
          values
        )
      );
    }
    return coreList(
      pool,
      "programs p LEFT JOIN institutions i ON i.unitid = p.institution_unitid",
      whereParts(parts, values),
      "ORDER BY p.institution_name ASC, p.cip_code ASC, p.id ASC",
      query,
      (row) => mapProgram(row),
      `p.id, p.institution_unitid, p.institution_name, p.cip_code, p.cip_title,
       p.credential_level, p.credential_title, p.median_earnings, p.median_debt,
       i.state AS state, p.source, p.source_url, p.fetched_at`
    );
  }

  if (resource === "sponsors") {
    pushEq(parts, values, "state", query.state);
    pushEq(parts, values, "organization_type", query.type);
    pushSource(parts, values, query.source);
    if (query.channel) {
      values.push(query.channel);
      parts.push(`$${values.length} = 'apprenticeship'`);
    }
    if (query.q) parts.push(qClause(["name", "city", "county"], query.q, values));
    return coreList(
      pool,
      "apprenticeship_sponsors",
      whereParts(parts, values),
      "ORDER BY name ASC, sponsor_key ASC",
      query,
      mapSponsor
    );
  }

  if (resource === "occupations") {
    pushSource(parts, values, query.source);
    if (query.soc) parts.push(socClause("onet_soc", query.soc, values));
    if (query.q) parts.push(qClause(["title", "description", "onet_soc"], query.q, values));
    return coreList(
      pool,
      "occupations",
      whereParts(parts, values),
      "ORDER BY title ASC, onet_soc ASC",
      query,
      mapOccupation
    );
  }

  if (resource === "wages") {
    if (query.state) {
      values.push(query.state);
      parts.push(
        `(LOWER(area_code) = LOWER($${values.length}) OR LOWER(area_name) = LOWER($${values.length}))`
      );
    }
    pushEq(parts, values, "area_type", query.type);
    pushSource(parts, values, query.source);
    if (query.soc) parts.push(socClause("soc_code", query.soc, values));
    if (query.q) parts.push(qClause(["occupation_title", "area_name", "soc_code"], query.q, values));
    return coreList(
      pool,
      "wage_observations",
      whereParts(parts, values),
      "ORDER BY occupation_title ASC, area_code ASC, id ASC",
      query,
      mapWage
    );
  }

  pushSource(parts, values, query.source);
  pushEq(parts, values, "typical_education", query.type);
  if (query.soc) parts.push(socClause("soc_code", query.soc, values));
  if (query.outlook === "grow") parts.push("change_percent > 0");
  if (query.outlook === "decline") parts.push("change_percent < 0");
  if (query.q) parts.push(qClause(["occupation_title", "soc_code", "typical_education"], query.q, values));
  return coreList(
    pool,
    "projections",
    whereParts(parts, values),
    "ORDER BY change_percent DESC NULLS LAST, occupation_title ASC, id ASC",
    query,
    mapProjection
  );
}

const FLEX_TABLES: Record<
  "credentials" | "licenses" | "certifications" | "econ",
  readonly string[]
> = {
  credentials: ["credentials"],
  licenses: ["licenses"],
  certifications: ["certifications"],
  econ: ["econ_indicators"],
};

const FLEX_FIELDS: Record<string, readonly string[]> = {
  credential_id: ["credential_id", "id", "ctid"],
  name: ["name", "title", "credential_name"],
  description: ["description"],
  credential_type: ["credential_type", "type", "credentialtype"],
  organization: ["organization", "org", "owned_by", "provider"],
  url: ["url", "webpage", "subject_webpage"],
  cip_code: ["cip_code", "cip"],
  state: ["state"],
  occupation_code: ["occupation_code", "soc_code", "onet_soc"],
  license_id: ["license_id", "id"],
  title: ["title", "name"],
  agency_name: ["agency_name", "agency"],
  agency_url: ["agency_url"],
  active_status: ["active_status", "status"],
  cert_id: ["cert_id", "id"],
  cert_type: ["cert_type", "type"],
  series_id: ["series_id", "indicator_key", "indicator", "variable"],
  geo_id: ["geo_id", "geoid", "geo_fips"],
  geo_name: ["geo_name", "area_name", "name"],
  period: ["period", "time_period", "date", "year"],
  value: ["value"],
  unit: ["unit"],
  id: ["id"],
  source: ["source"],
  source_url: ["source_url"],
  fetched_at: ["fetched_at"],
};

async function tableColumns(pool: Pool, table: string): Promise<Set<string> | null> {
  try {
    const rel = await pool.query<{ rel: string | null }>("SELECT to_regclass($1) AS rel", [
      `public.${table}`,
    ]);
    if (!rel.rows[0]?.rel) return null;
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    return new Set(rows.map((row) => row.column_name));
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

function pickCol(columns: Set<string>, aliases: readonly string[]): string | null {
  const byLower = new Map([...columns].map((name) => [name.toLowerCase(), name]));
  for (const alias of aliases) {
    const found = byLower.get(alias.toLowerCase());
    if (found) return found;
  }
  return null;
}

function cell(row: Record<string, unknown>, columns: Set<string>, field: string): unknown {
  const column = pickCol(columns, FLEX_FIELDS[field] ?? [field]);
  if (!column) return null;
  return row[column] ?? row[column.toLowerCase()] ?? null;
}

async function readFlexible(
  pool: Pool,
  resource: "credentials" | "licenses" | "certifications" | "econ",
  query: WarehouseListQuery
): Promise<WarehousePage> {
  let table: string | null = null;
  let columns: Set<string> | null = null;
  for (const candidate of FLEX_TABLES[resource]) {
    columns = await tableColumns(pool, candidate);
    if (columns) {
      table = candidate;
      break;
    }
  }
  if (!table || !columns) {
    return { rows: [], limit: query.limit, offset: query.offset, total: 0 };
  }

  const parts: string[] = [];
  const values: unknown[] = [];
  const col = (field: string): string | null => {
    const name = pickCol(columns!, FLEX_FIELDS[field] ?? [field]);
    return name ? quoteIdent(name) : null;
  };

  const sourceCol = col("source");
  if (query.source && sourceCol) {
    values.push(query.source);
    parts.push(`${sourceCol} = $${values.length}`);
  }
  const stateCol = col("state");
  const geoId = col("geo_id");
  const geoName = col("geo_name");
  if (query.state && resource === "econ" && (geoId || geoName)) {
    values.push(query.state);
    const idx = values.length;
    const bits = [geoId, geoName].filter((name): name is string => Boolean(name));
    parts.push(`(${bits.map((name) => `LOWER(${name}) = LOWER($${idx})`).join(" OR ")})`);
  } else if (query.state && stateCol) {
    values.push(query.state);
    parts.push(`LOWER(${stateCol}) = LOWER($${values.length})`);
  }
  const typeField =
    resource === "credentials" ? "credential_type" : resource === "certifications" ? "cert_type" : null;
  const typeCol = typeField ? col(typeField) : null;
  if (query.type && typeCol) {
    values.push(query.type);
    parts.push(`LOWER(${typeCol}) = LOWER($${values.length})`);
  }
  const socField = resource === "credentials" ? "occupation_code" : null;
  const socCol = socField ? col(socField) : null;
  if (query.soc && socCol) parts.push(socClause(socCol, query.soc, values));
  const cipCol = col("cip_code");
  const nameCol = col("name");
  if (query.cip && resource === "credentials" && (cipCol || nameCol)) {
    const bits: string[] = [];
    if (cipCol) {
      values.push(query.cip.replace(/\./g, "").toLowerCase());
      bits.push(`REPLACE(LOWER(${cipCol}), '.', '') LIKE $${values.length} || '%'`);
    }
    if (nameCol) {
      values.push(likeContains(query.cip));
      bits.push(`${nameCol} ILIKE $${values.length} ESCAPE '\\'`);
    }
    parts.push(`(${bits.join(" OR ")})`);
  }
  if (query.q) {
    const qFields =
      resource === "credentials"
        ? ["name", "organization", "description", "credential_id"]
        : resource === "licenses"
          ? ["title", "agency_name", "license_id"]
          : resource === "certifications"
            ? ["name", "organization", "cert_id"]
            : ["title", "series_id", "geo_name"];
    const qCols = qFields.map((field) => col(field)).filter((name): name is string => Boolean(name));
    if (qCols.length) parts.push(qClause(qCols, query.q, values));
  }

  const orderCol =
    resource === "econ"
      ? col("period")
      : resource === "licenses"
        ? col("title")
        : nameCol ?? col("title");
  const idCol =
    resource === "credentials"
      ? col("credential_id")
      : resource === "licenses"
        ? col("license_id")
        : resource === "certifications"
          ? col("cert_id")
          : col("id");
  const order =
    resource === "econ"
      ? `ORDER BY ${orderCol ?? "1"} DESC NULLS LAST${idCol ? `, ${idCol} ASC` : ""}`
      : `ORDER BY ${orderCol ?? "1"} ASC NULLS LAST${idCol ? `, ${idCol} ASC` : ""}`;

  try {
    const page = await runPaged(
      pool,
      "*",
      quoteIdent(table),
      whereParts(parts, values),
      order,
      query.limit,
      query.offset,
      (row) => mapFlexible(resource, row, columns)
    );
    return page;
  } catch (err) {
    if (isMissingRelation(err) || isUndefinedColumnError(err)) {
      return { rows: [], limit: query.limit, offset: query.offset, total: 0 };
    }
    throw err;
  }
}

function mapFlexible(
  resource: "credentials" | "licenses" | "certifications" | "econ",
  row: Record<string, unknown>,
  columns: Set<string>
): Record<string, unknown> {
  const read = (field: string) => cell(row, columns, field);
  const prov = {
    source: str(read("source")),
    source_url: str(read("source_url")),
    fetched_at: iso(read("fetched_at")),
  };
  if (resource === "licenses") {
    return {
      license_id: str(read("license_id")),
      title: str(read("title")),
      state: str(read("state")),
      agency_name: str(read("agency_name")),
      agency_url: str(read("agency_url")),
      active_status: str(read("active_status")),
      ...prov,
    };
  }
  if (resource === "certifications") {
    return {
      cert_id: str(read("cert_id")),
      name: str(read("name")),
      organization: str(read("organization")),
      url: str(read("url")),
      cert_type: str(read("cert_type")),
      ...prov,
    };
  }
  if (resource === "econ") {
    const series = str(read("series_id"));
    const geo = str(read("geo_id"));
    const period = str(read("period"));
    const source = prov.source;
    return {
      id: str(read("id")) ?? [source, series, geo, period].filter(Boolean).join(":"),
      series_id: series,
      title: str(read("title")),
      geo_id: geo,
      geo_name: str(read("geo_name")),
      period,
      value: num(read("value")),
      unit: str(read("unit")),
      ...prov,
    };
  }
  return {
    credential_id: str(read("credential_id")),
    name: str(read("name")),
    description: str(read("description")),
    credential_type: str(read("credential_type")),
    organization: str(read("organization")),
    url: str(read("url")),
    cip_code: str(read("cip_code")),
    state: str(read("state")),
    occupation_code: str(read("occupation_code")),
    ...prov,
  };
}

async function chunked<T>(rows: T[], fn: (slice: T[]) => Promise<void>): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

export async function upsertLicenseRows(pool: Pool, rows: LicenseRecord[]): Promise<number> {
  return chunked(rows, async (slice) => {
    const values: unknown[] = [];
    const tuples = slice.map((row, i) => {
      const b = i * 9;
      values.push(
        row.license_id,
        row.title,
        row.state,
        row.agency_name,
        row.agency_url,
        row.active_status,
        row.source,
        row.source_url,
        row.fetched_at
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
    });
    await pool.query(
      `INSERT INTO licenses (
         license_id, title, state, agency_name, agency_url, active_status,
         source, source_url, fetched_at
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (license_id) DO UPDATE SET
         title = EXCLUDED.title,
         state = EXCLUDED.state,
         agency_name = EXCLUDED.agency_name,
         agency_url = EXCLUDED.agency_url,
         active_status = EXCLUDED.active_status,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         fetched_at = EXCLUDED.fetched_at,
         updated_at = now()`,
      values
    );
  });
}

export async function upsertCertificationRows(
  pool: Pool,
  rows: CertificationRecord[]
): Promise<number> {
  return chunked(rows, async (slice) => {
    const values: unknown[] = [];
    const tuples = slice.map((row, i) => {
      const b = i * 8;
      values.push(
        row.cert_id,
        row.name,
        row.organization,
        row.url,
        row.cert_type,
        row.source,
        row.source_url,
        row.fetched_at
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    });
    await pool.query(
      `INSERT INTO certifications (
         cert_id, name, organization, url, cert_type, source, source_url, fetched_at
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (cert_id) DO UPDATE SET
         name = EXCLUDED.name,
         organization = EXCLUDED.organization,
         url = EXCLUDED.url,
         cert_type = EXCLUDED.cert_type,
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         fetched_at = EXCLUDED.fetched_at,
         updated_at = now()`,
      values
    );
  });
}

export async function upsertEconRows(pool: Pool, rows: EconIndicatorRecord[]): Promise<number> {
  return chunked(rows, async (slice) => {
    const values: unknown[] = [];
    const tuples = slice.map((row, i) => {
      const b = i * 10;
      values.push(
        row.series_id,
        row.title,
        row.geo_id || "",
        row.geo_name,
        row.period,
        row.value,
        row.unit,
        row.source,
        row.source_url,
        row.fetched_at
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
    });
    await pool.query(
      `INSERT INTO econ_indicators (
         series_id, title, geo_id, geo_name, period, value, unit, source, source_url, fetched_at
       ) VALUES ${tuples.join(",")}
       ON CONFLICT (source, series_id, geo_id, period) DO UPDATE SET
         title = EXCLUDED.title,
         geo_name = EXCLUDED.geo_name,
         value = EXCLUDED.value,
         unit = EXCLUDED.unit,
         source_url = EXCLUDED.source_url,
         fetched_at = EXCLUDED.fetched_at,
         updated_at = now()`,
      values
    );
  });
}

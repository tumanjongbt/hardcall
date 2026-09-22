import type { Pool } from "pg";
import type { SponsorRecord } from "./adapters/apprenticeship";
import type { WageRecord } from "./adapters/bls";
import type { ProjectionRecord } from "./adapters/bls_ep";
import type { OccupationRecord } from "./adapters/onet";
import type { InstitutionRecord, ProgramRecord } from "./adapters/scorecard";
import type { CreateEvent, CreateInsight, EventRow, InsightRow } from "../types";

export type WarehouseStats = {
  institutions: number;
  programs: number;
  apprenticeship_sponsors: number;
  occupations: number;
  wage_observations: number;
  projections: number;
  latest_fetched_at: string | null;
};

const CHUNK = 200;

async function chunked<T>(
  rows: T[],
  fn: (slice: T[]) => Promise<void>
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
  return rows.length;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export type Warehouse = {
  stats(): Promise<WarehouseStats>;
  upsertInstitutions(rows: InstitutionRecord[]): Promise<number>;
  upsertPrograms(rows: ProgramRecord[]): Promise<number>;
  upsertSponsors(rows: SponsorRecord[]): Promise<number>;
  upsertOccupations(rows: OccupationRecord[]): Promise<number>;
  upsertWages(rows: WageRecord[]): Promise<number>;
  upsertProjections(rows: ProjectionRecord[]): Promise<number>;
  upsertDerivedEvent(value: CreateEvent & { external_id: string }): Promise<EventRow>;
  upsertDerivedInsight(value: CreateInsight): Promise<InsightRow>;
};

export function createPgWarehouse(pool: Pool): Warehouse {
  return {
    async stats(): Promise<WarehouseStats> {
      const { rows } = await pool.query<{
        institutions: string;
        programs: string;
        apprenticeship_sponsors: string;
        occupations: string;
        wage_observations: string;
        projections: string;
        latest_fetched_at: Date | string | null;
      }>(`
        SELECT
          (SELECT count(*)::text FROM institutions) AS institutions,
          (SELECT count(*)::text FROM programs) AS programs,
          (SELECT count(*)::text FROM apprenticeship_sponsors) AS apprenticeship_sponsors,
          (SELECT count(*)::text FROM occupations) AS occupations,
          (SELECT count(*)::text FROM wage_observations) AS wage_observations,
          (SELECT count(*)::text FROM projections) AS projections,
          (
            SELECT max(fetched_at) FROM (
              SELECT fetched_at FROM institutions
              UNION ALL SELECT fetched_at FROM programs
              UNION ALL SELECT fetched_at FROM apprenticeship_sponsors
              UNION ALL SELECT fetched_at FROM occupations
              UNION ALL SELECT fetched_at FROM wage_observations
              UNION ALL SELECT fetched_at FROM projections
            ) t
          ) AS latest_fetched_at
      `);
      const row = rows[0];
      return {
        institutions: Number(row?.institutions ?? 0),
        programs: Number(row?.programs ?? 0),
        apprenticeship_sponsors: Number(row?.apprenticeship_sponsors ?? 0),
        occupations: Number(row?.occupations ?? 0),
        wage_observations: Number(row?.wage_observations ?? 0),
        projections: Number(row?.projections ?? 0),
        latest_fetched_at: toIsoOrNull(row?.latest_fetched_at ?? null),
      };
    },

    async upsertInstitutions(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 13;
          values.push(
            row.unitid,
            row.name,
            row.city,
            row.state,
            row.control,
            row.operating,
            row.tuition_in_state,
            row.tuition_out_state,
            row.net_price,
            row.median_earnings,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
        });
        await pool.query(
          `INSERT INTO institutions (
             unitid, name, city, state, control, operating,
             tuition_in_state, tuition_out_state, net_price, median_earnings,
             source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (unitid) DO UPDATE SET
             name = EXCLUDED.name,
             city = EXCLUDED.city,
             state = EXCLUDED.state,
             control = EXCLUDED.control,
             operating = EXCLUDED.operating,
             tuition_in_state = EXCLUDED.tuition_in_state,
             tuition_out_state = EXCLUDED.tuition_out_state,
             net_price = EXCLUDED.net_price,
             median_earnings = EXCLUDED.median_earnings,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertPrograms(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 11;
          values.push(
            row.institution_unitid,
            row.institution_name,
            row.cip_code,
            row.cip_title,
            row.credential_level,
            row.credential_title,
            row.median_earnings,
            row.median_debt,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
        });
        await pool.query(
          `INSERT INTO programs (
             institution_unitid, institution_name, cip_code, cip_title,
             credential_level, credential_title, median_earnings, median_debt,
             source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (institution_unitid, cip_code, credential_level) DO UPDATE SET
             institution_name = EXCLUDED.institution_name,
             cip_title = EXCLUDED.cip_title,
             credential_title = EXCLUDED.credential_title,
             median_earnings = EXCLUDED.median_earnings,
             median_debt = EXCLUDED.median_debt,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertSponsors(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 12;
          values.push(
            row.sponsor_key,
            row.name,
            row.organization_type,
            row.website,
            row.city,
            row.state,
            row.zip,
            row.county,
            row.registered_at,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
        });
        await pool.query(
          `INSERT INTO apprenticeship_sponsors (
             sponsor_key, name, organization_type, website, city, state, zip, county,
             registered_at, source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (sponsor_key) DO UPDATE SET
             name = EXCLUDED.name,
             organization_type = EXCLUDED.organization_type,
             website = EXCLUDED.website,
             city = EXCLUDED.city,
             state = EXCLUDED.state,
             zip = EXCLUDED.zip,
             county = EXCLUDED.county,
             registered_at = EXCLUDED.registered_at,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertOccupations(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 6;
          values.push(
            row.onet_soc,
            row.title,
            row.description,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
        });
        await pool.query(
          `INSERT INTO occupations (
             onet_soc, title, description, source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (onet_soc) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertWages(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 14;
          values.push(
            row.soc_code,
            row.occupation_title,
            row.area_code,
            row.area_name,
            row.area_type,
            row.period,
            row.employment,
            row.mean_annual_wage,
            row.median_annual_wage,
            row.mean_hourly_wage,
            row.median_hourly_wage,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`;
        });
        await pool.query(
          `INSERT INTO wage_observations (
             soc_code, occupation_title, area_code, area_name, area_type, period,
             employment, mean_annual_wage, median_annual_wage, mean_hourly_wage, median_hourly_wage,
             source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (occupation_title, area_code, period) DO UPDATE SET
             soc_code = EXCLUDED.soc_code,
             area_name = EXCLUDED.area_name,
             area_type = EXCLUDED.area_type,
             employment = EXCLUDED.employment,
             mean_annual_wage = EXCLUDED.mean_annual_wage,
             median_annual_wage = EXCLUDED.median_annual_wage,
             mean_hourly_wage = EXCLUDED.mean_hourly_wage,
             median_hourly_wage = EXCLUDED.median_hourly_wage,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertProjections(rows) {
      return chunked(rows, async (slice) => {
        const values: unknown[] = [];
        const tuples = slice.map((row, i) => {
          const b = i * 10;
          values.push(
            row.soc_code,
            row.occupation_title,
            row.period,
            row.employment_base,
            row.employment_proj,
            row.change_percent,
            row.typical_education,
            row.source,
            row.source_url,
            row.fetched_at
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
        });
        await pool.query(
          `INSERT INTO projections (
             soc_code, occupation_title, period, employment_base, employment_proj,
             change_percent, typical_education, source, source_url, fetched_at
           ) VALUES ${tuples.join(",")}
           ON CONFLICT (occupation_title, period) DO UPDATE SET
             soc_code = EXCLUDED.soc_code,
             employment_base = EXCLUDED.employment_base,
             employment_proj = EXCLUDED.employment_proj,
             change_percent = EXCLUDED.change_percent,
             typical_education = EXCLUDED.typical_education,
             source = EXCLUDED.source,
             source_url = EXCLUDED.source_url,
             fetched_at = EXCLUDED.fetched_at,
             updated_at = now()`,
          values
        );
      });
    },

    async upsertDerivedEvent(value) {
      const { rows } = await pool.query(
        `INSERT INTO events (
           channel, title, description, emoji, tags, source, source_url, fetched_at, external_id
         ) VALUES ($1,$2,$3,$4,$5::stakeholder_tag[],$6,$7,$8,$9)
         ON CONFLICT (external_id) DO UPDATE SET
           channel = EXCLUDED.channel,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           emoji = EXCLUDED.emoji,
           tags = EXCLUDED.tags,
           source = EXCLUDED.source,
           source_url = EXCLUDED.source_url,
           fetched_at = EXCLUDED.fetched_at
         RETURNING id, channel, title, description, emoji, tags::text[] AS tags, created_at,
                   source, source_url, fetched_at`,
        [
          value.channel,
          value.title,
          value.description,
          value.emoji,
          value.tags,
          value.source,
          value.source_url,
          value.fetched_at,
          value.external_id,
        ]
      );
      const row = rows[0];
      return {
        id: row.id,
        channel: row.channel,
        title: row.title,
        description: row.description,
        emoji: row.emoji,
        tags: row.tags,
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
        source: row.source,
        source_url: row.source_url,
        fetched_at: toIsoOrNull(row.fetched_at),
      };
    },

    async upsertDerivedInsight(value) {
      const { rows } = await pool.query(
        `INSERT INTO insights (title, value, detail, source, source_url, fetched_at)
         VALUES ($1,$2,COALESCE($3,''),$4,$5,$6)
         ON CONFLICT (title) DO UPDATE SET
           value = EXCLUDED.value,
           detail = COALESCE($3, insights.detail),
           source = EXCLUDED.source,
           source_url = EXCLUDED.source_url,
           fetched_at = EXCLUDED.fetched_at,
           updated_at = now()
         RETURNING id, title, value, detail, source, source_url, fetched_at, created_at, updated_at`,
        [
          value.title,
          value.value,
          value.detail ?? "",
          value.source,
          value.source_url ?? null,
          value.fetched_at ?? null,
        ]
      );
      const row = rows[0];
      return {
        id: row.id,
        title: row.title,
        value: row.value,
        detail: row.detail ?? "",
        source: row.source,
        source_url: row.source_url ?? null,
        fetched_at: toIsoOrNull(row.fetched_at),
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : new Date(row.created_at).toISOString(),
        updated_at:
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : new Date(row.updated_at).toISOString(),
      };
    },
  };
}

export const EMPTY_WAREHOUSE_STATS: WarehouseStats = {
  institutions: 0,
  programs: 0,
  apprenticeship_sponsors: 0,
  occupations: 0,
  wage_observations: 0,
  projections: 0,
  latest_fetched_at: null,
};

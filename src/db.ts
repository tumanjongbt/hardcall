import { Pool } from "pg";
import type {
  CreateEvent,
  CreateInsight,
  EventRow,
  EventSource,
  InsightRow,
  InsightSource,
  Store,
} from "./types";

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

function mapRow(row: {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: Date | string;
  source: EventSource;
  source_url: string | null;
  fetched_at: Date | string | null;
}): EventRow {
  return {
    id: row.id,
    channel: row.channel,
    title: row.title,
    description: row.description,
    emoji: row.emoji,
    tags: row.tags,
    created_at: toIso(row.created_at),
    source: row.source,
    source_url: row.source_url,
    fetched_at: toIsoOrNull(row.fetched_at),
  };
}

function mapInsightRow(row: {
  id: string;
  title: string;
  value: string;
  detail: string;
  source: InsightSource;
  source_url?: string | null;
  fetched_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): InsightRow {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    detail: row.detail ?? "",
    source: row.source,
    source_url: row.source_url ?? null,
    fetched_at: toIsoOrNull(row.fetched_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

/** Postgres undefined_column — live DB missing 006 insight provenance columns. */
export function isUndefinedColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: string }).code === "42703";
}

const INSIGHT_LIST_SQL = `SELECT id, title, value, detail, source, source_url, fetched_at, created_at, updated_at
         FROM insights
         WHERE ($1::boolean OR source <> 'synthetic')
         ORDER BY updated_at DESC, title ASC`;

/** Pre-006 insights (004 added source, not source_url/fetched_at). */
const INSIGHT_LIST_SQL_PRE_006 = `SELECT id, title, value, detail, source, created_at, updated_at
         FROM insights
         WHERE ($1::boolean OR source <> 'synthetic')
         ORDER BY updated_at DESC, title ASC`;

const INSIGHT_UPSERT_SQL = `INSERT INTO insights (title, value, detail, source, source_url, fetched_at)
         VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, 'synthetic'), $5, $6)
         ON CONFLICT (title) DO UPDATE
           SET value = EXCLUDED.value,
               detail = COALESCE($3, insights.detail),
               source = COALESCE($4, insights.source),
               source_url = COALESCE($5, insights.source_url),
               fetched_at = COALESCE($6, insights.fetched_at),
               updated_at = now()
         RETURNING id, title, value, detail, source, source_url, fetched_at, created_at, updated_at, (xmax = 0) AS inserted`;

const INSIGHT_UPSERT_SQL_PRE_006 = `INSERT INTO insights (title, value, detail, source)
         VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, 'synthetic'))
         ON CONFLICT (title) DO UPDATE
           SET value = EXCLUDED.value,
               detail = COALESCE($3, insights.detail),
               source = COALESCE($4, insights.source),
               updated_at = now()
         RETURNING id, title, value, detail, source, created_at, updated_at, (xmax = 0) AS inserted`;

export function createPgStore(pool: Pool): Store {
  return {
    async insertEvent(value: CreateEvent): Promise<EventRow> {
      const { rows } = await pool.query(
        `INSERT INTO events (channel, title, description, emoji, tags, source, source_url, fetched_at, created_at)
         VALUES ($1, $2, $3, $4, $5::stakeholder_tag[], $6, $7, $8, COALESCE($9::timestamptz, now()))
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
          value.created_at ?? null,
        ]
      );
      return mapRow(rows[0]);
    },
    async listEvents(query): Promise<EventRow[]> {
      const includeDemo = query.includeDemo !== false;
      const { rows } = await pool.query(
        `SELECT id, channel, title, description, emoji, tags::text[] AS tags, created_at,
                source, source_url, fetched_at
         FROM events
         WHERE ($1::text IS NULL OR channel = $1::event_channel)
           AND ($3::boolean OR source NOT IN ('synthetic', 'playground', 'cli'))
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [query.channel ?? null, query.limit, includeDemo]
      );
      return rows.map(mapRow);
    },
    async upsertInsight(value: CreateInsight): Promise<{ row: InsightRow; created: boolean }> {
      const detail = value.detail === undefined ? null : value.detail;
      const source = value.source === undefined ? null : value.source;
      const sourceUrl = value.source_url === undefined ? null : value.source_url;
      const fetchedAt = value.fetched_at === undefined ? null : value.fetched_at;
      let rows: Array<Parameters<typeof mapInsightRow>[0] & { inserted?: boolean }>;
      try {
        ({ rows } = await pool.query(INSIGHT_UPSERT_SQL, [
          value.title,
          value.value,
          detail,
          source,
          sourceUrl,
          fetchedAt,
        ]));
      } catch (err) {
        if (!isUndefinedColumnError(err)) throw err;
        ({ rows } = await pool.query(INSIGHT_UPSERT_SQL_PRE_006, [
          value.title,
          value.value,
          detail,
          source,
        ]));
      }
      const row = rows[0];
      return {
        row: mapInsightRow(row),
        created: Boolean(row.inserted),
      };
    },
    async listInsights(query): Promise<InsightRow[]> {
      const includeDemo = query?.includeDemo !== false;
      try {
        const { rows } = await pool.query(INSIGHT_LIST_SQL, [includeDemo]);
        return rows.map(mapInsightRow);
      } catch (err) {
        if (!isUndefinedColumnError(err)) throw err;
        const { rows } = await pool.query(INSIGHT_LIST_SQL_PRE_006, [includeDemo]);
        return rows.map(mapInsightRow);
      }
    },
  };
}

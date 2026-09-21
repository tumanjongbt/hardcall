import { Pool } from "pg";
import type { CreateEvent, CreateInsight, EventRow, InsightRow, Store } from "./types";

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: {
  id: string;
  channel: string;
  title: string;
  description: string | null;
  emoji: string | null;
  tags: string[];
  created_at: Date | string;
}): EventRow {
  return {
    id: row.id,
    channel: row.channel,
    title: row.title,
    description: row.description,
    emoji: row.emoji,
    tags: row.tags,
    created_at: toIso(row.created_at),
  };
}

function mapInsightRow(row: {
  id: string;
  title: string;
  value: string;
  detail: string;
  created_at: Date | string;
  updated_at: Date | string;
}): InsightRow {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    detail: row.detail ?? "",
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export function createPgStore(pool: Pool): Store {
  return {
    async insertEvent(value: CreateEvent): Promise<EventRow> {
      const { rows } = await pool.query(
        `INSERT INTO events (channel, title, description, emoji, tags)
         VALUES ($1, $2, $3, $4, $5::stakeholder_tag[])
         RETURNING id, channel, title, description, emoji, tags::text[] AS tags, created_at`,
        [value.channel, value.title, value.description, value.emoji, value.tags]
      );
      return mapRow(rows[0]);
    },
    async listEvents(query): Promise<EventRow[]> {
      const { rows } = await pool.query(
        `SELECT id, channel, title, description, emoji, tags::text[] AS tags, created_at
         FROM events
         WHERE ($1::text IS NULL OR channel = $1::event_channel)
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [query.channel ?? null, query.limit]
      );
      return rows.map(mapRow);
    },
    async upsertInsight(value: CreateInsight): Promise<{ row: InsightRow; created: boolean }> {
      const detail = value.detail === undefined ? null : value.detail;
      const { rows } = await pool.query(
        `INSERT INTO insights (title, value, detail)
         VALUES ($1, $2, COALESCE($3, ''))
         ON CONFLICT (title) DO UPDATE
           SET value = EXCLUDED.value,
               detail = COALESCE($3, insights.detail),
               updated_at = now()
         RETURNING id, title, value, detail, created_at, updated_at, (xmax = 0) AS inserted`,
        [value.title, value.value, detail]
      );
      const row = rows[0];
      return {
        row: mapInsightRow(row),
        created: Boolean(row.inserted),
      };
    },
    async listInsights(): Promise<InsightRow[]> {
      const { rows } = await pool.query(
        `SELECT id, title, value, detail, created_at, updated_at
         FROM insights
         ORDER BY updated_at DESC, title ASC`
      );
      return rows.map(mapInsightRow);
    },
  };
}

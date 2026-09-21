import { Pool } from "pg";
import type { CreateEvent, EventRow, EventStore } from "./types";

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

export function createPgStore(pool: Pool): EventStore {
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
  };
}

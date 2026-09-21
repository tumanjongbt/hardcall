-- Hardcall Phase 1 — events only. Neutral DDL (no hardcall identifiers).
-- Channel + stakeholder tags locked by Bernard 2026-09-20.
-- Illegal states blocked: empty title, invalid channel/tag, half-empty optionals as empty strings (API should null them).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE event_channel AS ENUM (
  'university',
  'community_college',
  'trade',
  'apprenticeship',
  'automation'
);

CREATE TYPE stakeholder_tag AS ENUM (
  'high_school_students',
  'college_students',
  'parents',
  'career_counselors',
  'workforce_training_managers'
);

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     event_channel NOT NULL,
  title       text NOT NULL,
  description text,
  emoji       text,
  tags        stakeholder_tag[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT events_description_len CHECK (
    description IS NULL OR char_length(description) BETWEEN 1 AND 4000
  ),
  CONSTRAINT events_emoji_len CHECK (
    emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16
  )
);

CREATE INDEX events_created_at_desc_idx
  ON events (created_at DESC, id DESC);

CREATE INDEX events_channel_created_at_idx
  ON events (channel, created_at DESC);

CREATE INDEX events_tags_gin_idx
  ON events USING gin (tags);

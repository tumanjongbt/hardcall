-- Reactive market insights (KPI cards). Neutral DDL (no product identifiers).
-- Exact-title upsert key: UNIQUE(title). Empty / overlong title or value is illegal.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insights_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT insights_value_len CHECK (char_length(btrim(value)) BETWEEN 1 AND 500),
  CONSTRAINT insights_title_key UNIQUE (title)
);

CREATE UNIQUE INDEX insights_title_uidx ON insights (title);

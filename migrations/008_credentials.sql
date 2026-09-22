-- Credential Engine warehouse. Neutral DDL (no product identifiers).
-- Live Supabase may already have this table from an out-of-band 008.
-- CREATE TABLE IF NOT EXISTS does not alter or drop existing rows.
-- Boot migrate applies this after 007. Paste in the Supabase SQL editor
-- only if boot migrate failed, then:
--   INSERT INTO schema_migrations (id) VALUES ('008_credentials')
--   ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS credentials (
  credential_id   text PRIMARY KEY,
  name            text NOT NULL,
  description     text,
  credential_type text,
  organization    text,
  url             text,
  cip_code        text,
  state           text,
  occupation_code text,
  source          text NOT NULL,
  source_url      text NOT NULL,
  fetched_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 400),
  CONSTRAINT credentials_source_enum CHECK (
    source IN (
      'credential_engine',
      'scorecard',
      'bls',
      'onet',
      'apprenticeship_gov',
      'bls_ep',
      'ipeds',
      'careeronestop',
      'census',
      'bea',
      'fred'
    )
  ),
  CONSTRAINT credentials_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT credentials_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

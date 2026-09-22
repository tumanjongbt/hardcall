-- CareerOneStop licenses/certifications and Census/BEA/FRED indicators.
-- Neutral DDL. Live Supabase may already have these tables from an out-of-band 009.
-- CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS do not drop rows.
-- Boot migrate applies this after 008. Paste only if boot migrate failed, then:
--   INSERT INTO schema_migrations (id) VALUES ('009_licenses_certs_econ')
--   ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS licenses (
  license_id    text PRIMARY KEY,
  title         text NOT NULL,
  state         text,
  agency_name   text,
  agency_url    text,
  active_status text,
  source        text NOT NULL,
  source_url    text NOT NULL,
  fetched_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT licenses_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 400),
  CONSTRAINT licenses_source_enum CHECK (
    source IN (
      'careeronestop',
      'scorecard',
      'bls',
      'onet',
      'apprenticeship_gov',
      'bls_ep',
      'ipeds',
      'census',
      'bea',
      'fred',
      'credential_engine'
    )
  ),
  CONSTRAINT licenses_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT licenses_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS certifications (
  cert_id      text PRIMARY KEY,
  name         text NOT NULL,
  organization text,
  url          text,
  cert_type    text,
  source       text NOT NULL,
  source_url   text NOT NULL,
  fetched_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certifications_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 400),
  CONSTRAINT certifications_source_enum CHECK (
    source IN (
      'careeronestop',
      'scorecard',
      'bls',
      'onet',
      'apprenticeship_gov',
      'bls_ep',
      'ipeds',
      'census',
      'bea',
      'fred',
      'credential_engine'
    )
  ),
  CONSTRAINT certifications_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT certifications_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS econ_indicators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id  text NOT NULL,
  title      text NOT NULL,
  geo_id     text NOT NULL DEFAULT '',
  geo_name   text,
  period     text NOT NULL,
  value      numeric,
  unit       text,
  source     text NOT NULL,
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT econ_indicators_source_enum CHECK (
    source IN ('census', 'bea', 'fred')
  ),
  CONSTRAINT econ_indicators_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT econ_indicators_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  ),
  CONSTRAINT econ_indicators_key UNIQUE (source, series_id, geo_id, period)
);

-- Indexes on 006 columns. IF NOT EXISTS only; these tables already exist after 006.
CREATE INDEX IF NOT EXISTS programs_institution_unitid_idx ON programs (institution_unitid);
CREATE INDEX IF NOT EXISTS wage_observations_soc_idx ON wage_observations (soc_code);
CREATE INDEX IF NOT EXISTS projections_soc_idx ON projections (soc_code);
CREATE INDEX IF NOT EXISTS projections_change_percent_idx ON projections (change_percent);

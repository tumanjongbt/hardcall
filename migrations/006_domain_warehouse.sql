-- Domain warehouse + live-source enum expansion. Neutral DDL (no product identifiers).
-- Adds Scorecard / apprenticeship.gov / BLS EP source values, clickable insight
-- provenance, derived-event upsert keys, and tables the ingest worker fills.
-- Live reserved sources may only be written by server-side adapters (public POST
-- still rejects them). Every warehouse row requires source + source_url + fetched_at.
-- Render free-tier does not run release migrate — paste this file in the
-- Supabase SQL editor after merge. Then:
--   INSERT INTO schema_migrations (id) VALUES ('006_domain_warehouse')
--   ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Event / insight source enums
-- ---------------------------------------------------------------------------

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_source_enum;

ALTER TABLE events
  ADD CONSTRAINT events_source_enum CHECK (
    source IN (
      'synthetic',
      'manual',
      'playground',
      'cli',
      'bls',
      'onet',
      'scorecard',
      'apprenticeship_gov',
      'bls_ep',
      'unknown'
    )
  );

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_source_enum;

ALTER TABLE insights
  ADD CONSTRAINT insights_source_enum CHECK (
    source IN (
      'synthetic',
      'manual',
      'bls',
      'onet',
      'scorecard',
      'apprenticeship_gov',
      'bls_ep',
      'unknown'
    )
  );

-- ---------------------------------------------------------------------------
-- Insight provenance (every public KPI can cite a feed)
-- ---------------------------------------------------------------------------

ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_source_url_http;

ALTER TABLE insights
  ADD CONSTRAINT insights_source_url_http CHECK (
    source_url IS NULL OR source_url ~* '^https?://'
  );

-- ---------------------------------------------------------------------------
-- Derived live events: stable upsert key (not writable on public POST)
-- ---------------------------------------------------------------------------

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS external_id text;

-- Multiple NULLs are allowed (public POST omits this). Derived ingest sets a key.
CREATE UNIQUE INDEX IF NOT EXISTS events_external_id_uidx
  ON events (external_id);

-- ---------------------------------------------------------------------------
-- Live-source integrity: reserved sources must carry fetch evidence
-- ---------------------------------------------------------------------------

UPDATE events
SET source = 'unknown'
WHERE source IN ('bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep')
  AND (source_url IS NULL OR fetched_at IS NULL);

UPDATE insights
SET source = 'unknown'
WHERE source IN ('bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep')
  AND (source_url IS NULL OR fetched_at IS NULL);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_live_source_integrity;

ALTER TABLE events
  ADD CONSTRAINT events_live_source_integrity CHECK (
    source NOT IN ('bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep')
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_live_source_integrity;

ALTER TABLE insights
  ADD CONSTRAINT insights_live_source_integrity CHECK (
    source NOT IN ('bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep')
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Warehouse
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS institutions (
  unitid            text PRIMARY KEY,
  name              text NOT NULL,
  city              text,
  state             text,
  control           text,
  operating         boolean,
  tuition_in_state  numeric,
  tuition_out_state numeric,
  net_price         numeric,
  median_earnings   numeric,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 400),
  CONSTRAINT institutions_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT institutions_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT institutions_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS institutions_state_idx ON institutions (state);
CREATE INDEX IF NOT EXISTS institutions_fetched_at_idx ON institutions (fetched_at DESC);

CREATE TABLE IF NOT EXISTS programs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_unitid text NOT NULL,
  institution_name  text,
  cip_code          text NOT NULL,
  cip_title         text,
  credential_level  text NOT NULL DEFAULT '',
  credential_title  text,
  median_earnings   numeric,
  median_debt       numeric,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programs_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT programs_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT programs_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  ),
  CONSTRAINT programs_cip_key UNIQUE (institution_unitid, cip_code, credential_level)
);

CREATE INDEX IF NOT EXISTS programs_cip_idx ON programs (cip_code);

CREATE TABLE IF NOT EXISTS apprenticeship_sponsors (
  sponsor_key       text PRIMARY KEY,
  name              text NOT NULL,
  organization_type text,
  website           text,
  city              text,
  state             text,
  zip               text,
  county            text,
  registered_at     timestamptz,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apprenticeship_sponsors_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 400),
  CONSTRAINT apprenticeship_sponsors_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT apprenticeship_sponsors_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT apprenticeship_sponsors_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS apprenticeship_sponsors_state_idx
  ON apprenticeship_sponsors (state);

CREATE TABLE IF NOT EXISTS occupations (
  onet_soc          text PRIMARY KEY,
  title             text NOT NULL,
  description       text,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occupations_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 400),
  CONSTRAINT occupations_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT occupations_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT occupations_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS wage_observations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  soc_code          text,
  occupation_title  text NOT NULL,
  area_code         text NOT NULL DEFAULT 'US',
  area_name         text NOT NULL DEFAULT 'United States',
  area_type         text NOT NULL DEFAULT 'national',
  period            text NOT NULL,
  employment        numeric,
  mean_annual_wage  numeric,
  median_annual_wage numeric,
  mean_hourly_wage  numeric,
  median_hourly_wage numeric,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wage_observations_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT wage_observations_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT wage_observations_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  ),
  CONSTRAINT wage_observations_key UNIQUE (occupation_title, area_code, period)
);

CREATE INDEX IF NOT EXISTS wage_observations_period_idx ON wage_observations (period);

CREATE TABLE IF NOT EXISTS projections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  soc_code          text,
  occupation_title  text NOT NULL,
  period            text NOT NULL,
  employment_base   numeric,
  employment_proj   numeric,
  change_percent    numeric,
  typical_education text,
  source            text NOT NULL,
  source_url        text NOT NULL,
  fetched_at        timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projections_source_enum CHECK (
    source IN ('scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep')
  ),
  CONSTRAINT projections_source_url_http CHECK (source_url ~* '^https?://'),
  CONSTRAINT projections_live_provenance CHECK (
    source_url IS NOT NULL AND fetched_at IS NOT NULL
  ),
  CONSTRAINT projections_key UNIQUE (occupation_title, period)
);

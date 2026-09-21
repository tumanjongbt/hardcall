-- Extend reserved live-source enums for Phase B/C adapters (ipeds, careeronestop,
-- census, bea, fred). Public POST still cannot mint these — validators reject
-- them as reserved. Paste in the Supabase SQL editor after 006, then:
--   INSERT INTO schema_migrations (id) VALUES ('007_reserved_live_sources')
--   ON CONFLICT (id) DO NOTHING;
-- Neutral DDL (no product identifiers).

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
      'ipeds',
      'careeronestop',
      'census',
      'bea',
      'fred',
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
      'ipeds',
      'careeronestop',
      'census',
      'bea',
      'fred',
      'unknown'
    )
  );

-- ---------------------------------------------------------------------------
-- Live-source integrity: reserved sources must carry fetch evidence
-- ---------------------------------------------------------------------------

UPDATE events
SET source = 'unknown'
WHERE source IN (
    'bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
  AND (source_url IS NULL OR fetched_at IS NULL);

UPDATE insights
SET source = 'unknown'
WHERE source IN (
    'bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
  AND (source_url IS NULL OR fetched_at IS NULL);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_live_source_integrity;

ALTER TABLE events
  ADD CONSTRAINT events_live_source_integrity CHECK (
    source NOT IN (
      'bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep',
      'ipeds', 'careeronestop', 'census', 'bea', 'fred'
    )
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_live_source_integrity;

ALTER TABLE insights
  ADD CONSTRAINT insights_live_source_integrity CHECK (
    source NOT IN (
      'bls', 'onet', 'scorecard', 'apprenticeship_gov', 'bls_ep',
      'ipeds', 'careeronestop', 'census', 'bea', 'fred'
    )
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Warehouse source enums (future Phase B/C adapters)
-- ---------------------------------------------------------------------------

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_source_enum;
ALTER TABLE institutions ADD CONSTRAINT institutions_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_source_enum;
ALTER TABLE programs ADD CONSTRAINT programs_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

ALTER TABLE apprenticeship_sponsors DROP CONSTRAINT IF EXISTS apprenticeship_sponsors_source_enum;
ALTER TABLE apprenticeship_sponsors ADD CONSTRAINT apprenticeship_sponsors_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

ALTER TABLE occupations DROP CONSTRAINT IF EXISTS occupations_source_enum;
ALTER TABLE occupations ADD CONSTRAINT occupations_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

ALTER TABLE wage_observations DROP CONSTRAINT IF EXISTS wage_observations_source_enum;
ALTER TABLE wage_observations ADD CONSTRAINT wage_observations_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

ALTER TABLE projections DROP CONSTRAINT IF EXISTS projections_source_enum;
ALTER TABLE projections ADD CONSTRAINT projections_source_enum CHECK (
  source IN (
    'scorecard', 'bls', 'onet', 'apprenticeship_gov', 'bls_ep',
    'ipeds', 'careeronestop', 'census', 'bea', 'fred'
  )
);

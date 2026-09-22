-- Align econ_indicators with Live warehouse rows (BLS series may have null title/geo_id).
-- Widen source enum to include bls. Optional filter indexes for GET.
-- Idempotent ALTER / IF NOT EXISTS. No row drops.
-- Boot migrate applies after 009. Paste only if boot migrate failed, then:
--   INSERT INTO schema_migrations (id) VALUES ('010_econ_align')
--   ON CONFLICT (id) DO NOTHING;

ALTER TABLE econ_indicators
  ALTER COLUMN title DROP NOT NULL;

ALTER TABLE econ_indicators
  ALTER COLUMN geo_id DROP NOT NULL;

ALTER TABLE econ_indicators
  DROP CONSTRAINT IF EXISTS econ_indicators_source_enum;

ALTER TABLE econ_indicators
  ADD CONSTRAINT econ_indicators_source_enum CHECK (
    source IN ('census', 'bea', 'fred', 'bls')
  );

CREATE INDEX IF NOT EXISTS credentials_state_idx ON credentials (state);
CREATE INDEX IF NOT EXISTS credentials_cip_code_idx ON credentials (cip_code);
CREATE INDEX IF NOT EXISTS licenses_state_idx ON licenses (state);
CREATE INDEX IF NOT EXISTS econ_indicators_source_period_idx
  ON econ_indicators (source, period);

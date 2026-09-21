-- Longer analysis body for each market-insight KPI.
-- Neutral DDL (no hardcall identifiers). Unique title upsert key is unchanged.
-- Render free-tier does not run release migrate — paste this file in the
-- Supabase SQL editor after merge (same as 002_insights.sql). The migrate
-- runner records stem `003_insights_detail` in schema_migrations; after a
-- manual paste, also run:
--   INSERT INTO schema_migrations (id) VALUES ('003_insights_detail')
--   ON CONFLICT (id) DO NOTHING;

ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS detail text NOT NULL DEFAULT '';

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_detail_len;

ALTER TABLE insights
  ADD CONSTRAINT insights_detail_len CHECK (char_length(detail) <= 8000);

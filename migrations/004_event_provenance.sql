-- Provenance for events and insights. Neutral DDL (no hardcall identifiers).
-- Allowed event source: synthetic | manual | playground | cli | bls | onet | unknown
-- Allowed insight source: synthetic | manual | bls | onet | unknown
-- Existing rows are mock/playground/seed — backfill to synthetic. Do not invent bls/onet.
-- Render free-tier does not run release migrate — paste this file in the
-- Supabase SQL editor after merge (same as 002 / 003). The migrate runner
-- records stem `004_event_provenance` in schema_migrations; after a
-- manual paste, also run:
--   INSERT INTO schema_migrations (id) VALUES ('004_event_provenance')
--   ON CONFLICT (id) DO NOTHING;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

UPDATE events
  SET source = 'synthetic'
  WHERE source IS NULL;

ALTER TABLE events
  ALTER COLUMN source SET DEFAULT 'unknown';

ALTER TABLE events
  ALTER COLUMN source SET NOT NULL;

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
      'unknown'
    )
  );

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_source_url_http;

ALTER TABLE events
  ADD CONSTRAINT events_source_url_http CHECK (
    source_url IS NULL OR source_url ~* '^https?://'
  );

ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS source text;

UPDATE insights
  SET source = 'synthetic'
  WHERE source IS NULL;

ALTER TABLE insights
  ALTER COLUMN source SET DEFAULT 'synthetic';

ALTER TABLE insights
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE insights
  DROP CONSTRAINT IF EXISTS insights_source_enum;

ALTER TABLE insights
  ADD CONSTRAINT insights_source_enum CHECK (
    source IN (
      'synthetic',
      'manual',
      'bls',
      'onet',
      'unknown'
    )
  );

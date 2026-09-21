-- Live-source integrity. Neutral DDL (no product identifiers).
-- events.source bls|onet stay in the enum for future locked ingest.
-- Anonymous public POST cannot write those values (Orion reserved rule).
-- This CHECK is complementary: a live event row must carry fetch evidence.
-- Existing spoofed rows (source bls|onet with NULL source_url or fetched_at)
-- are remapped to unknown before the CHECK so ADD CONSTRAINT can succeed.
-- insights have no source_url/fetched_at — API reserved reject only.
-- Render free-tier does not run release migrate — paste this file in the
-- Supabase SQL editor after merge (same as 004). The migrate runner
-- records stem `005_live_source_integrity` in schema_migrations; after a
-- manual paste, also run:
--   INSERT INTO schema_migrations (id) VALUES ('005_live_source_integrity')
--   ON CONFLICT (id) DO NOTHING;
-- If that stem is already recorded without the constraint, do not rely on
-- the runner — run the UPDATE + ADD CONSTRAINT below manually.

-- Remap spoofed reserved sources (posted before Orion reserved reject).
UPDATE events
SET source = 'unknown'
WHERE source IN ('bls', 'onet')
  AND (source_url IS NULL OR fetched_at IS NULL);

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_live_source_integrity;

ALTER TABLE events
  ADD CONSTRAINT events_live_source_integrity CHECK (
    source NOT IN ('bls', 'onet')
    OR (source_url IS NOT NULL AND fetched_at IS NOT NULL)
  );

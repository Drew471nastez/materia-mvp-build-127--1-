-- Migration: Create seo_overrides table
-- Used by /admin/blog/seo dashboard to persist per-creator and per-page SEO overrides.
-- The API at /api/admin/blog/seo-settings reads/writes this table via the service role key.
-- The /u/[username] generateMetadata function reads it to override default SEO title/description.

CREATE TABLE IF NOT EXISTS seo_overrides (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  type        TEXT        NOT NULL,   -- 'creator' | 'page'
  identifier  TEXT        NOT NULL,   -- username for creators, url path (e.g. '/explore') for pages
  seo_title   TEXT,
  seo_description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (type, identifier)
);

CREATE INDEX IF NOT EXISTS idx_seo_overrides_type_identifier
  ON seo_overrides (type, identifier);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_seo_overrides_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seo_overrides_updated_at ON seo_overrides;
CREATE TRIGGER trg_seo_overrides_updated_at
  BEFORE UPDATE ON seo_overrides
  FOR EACH ROW EXECUTE FUNCTION update_seo_overrides_updated_at();

-- RLS: public reads allowed (SEO metadata is public); writes restricted to service role
ALTER TABLE seo_overrides ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for generateMetadata server function)
CREATE POLICY "Public read seo_overrides"
  ON seo_overrides FOR SELECT
  USING (true);

-- Only service role can insert/update/delete (admin API uses service role key)
CREATE POLICY "Service role write seo_overrides"
  ON seo_overrides FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

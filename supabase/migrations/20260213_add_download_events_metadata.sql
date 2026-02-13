-- Add metadata JSONB column to download_events for storing additional context
-- (e.g., PDF stamping info, fraud detection data)
DO $$ BEGIN
  ALTER TABLE download_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add index for finding stamped downloads
CREATE INDEX IF NOT EXISTS idx_download_events_metadata ON download_events USING gin (metadata) WHERE metadata IS NOT NULL;

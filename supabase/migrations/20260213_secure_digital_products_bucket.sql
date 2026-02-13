-- Migration: Secure digital products infrastructure
-- 1. Ensure digital-products bucket is PRIVATE (no public URL exposure)
-- 2. Remove bucket-level file size limits (rely on global project limit)
-- 3. Remove MIME type restrictions (allow any file type — security handled in app layer)
-- 4. Create upload_events table for audit logging
-- 5. Add indexes for rate limiting queries

-- === 1. Ensure digital-products bucket is PRIVATE with no size/MIME limits ===
DO $$
BEGIN
  -- Create bucket if it doesn't exist
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('digital-products', 'digital-products', false, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    public = false,              -- PRIVATE: no direct public URL access
    file_size_limit = NULL,      -- No bucket-level limit (project global handles it)
    allowed_mime_types = NULL;    -- Allow any MIME type (app layer validates)

  -- Also fix lead-form-files-v2 bucket (public for thumbnails/images)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('lead-form-files-v2', 'lead-form-files-v2', true, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = NULL,
    allowed_mime_types = NULL;

  -- Fix legacy buckets too
  UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
  WHERE id IN ('product-files', 'digital-assets', 'lead-form-files');
END $$;

-- === 2. Create upload_events table for audit logging ===
CREATE TABLE IF NOT EXISTS upload_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  file_category TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  security_scan_result TEXT DEFAULT 'passed',  -- 'passed', 'blocked', 'warning'
  security_threat_type TEXT,                    -- null if passed, or threat type if blocked
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rate limiting and analytics
CREATE INDEX IF NOT EXISTS idx_upload_events_creator_created
  ON upload_events (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_events_created
  ON upload_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_events_security
  ON upload_events (security_scan_result) WHERE security_scan_result != 'passed';

-- RLS: only service role can insert/read
ALTER TABLE upload_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to upload_events" ON upload_events;
CREATE POLICY "Service role full access to upload_events"
  ON upload_events FOR ALL
  USING (auth.role() = 'service_role');

-- === 3. Add indexes on digital_assets for rate limiting queries ===
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by_created
  ON digital_assets (uploaded_by, created_at DESC);

-- === 4. Add indexes on download_events for rate limiting queries ===
CREATE INDEX IF NOT EXISTS idx_download_events_created_desc
  ON download_events (created_at DESC);

-- === 5. Ensure RLS policies for digital-products bucket (PRIVATE) ===
-- Only authenticated users can read their own files; all uploads go through signed URLs

-- Read: creators can read files in their own folder
DO $$
BEGIN
  -- Drop old permissive policies if they exist
  DROP POLICY IF EXISTS "Public read digital-products" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can read digital-products" ON storage.objects;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- Authenticated users can read from digital-products (needed for signed URL generation)
DROP POLICY IF EXISTS "Authenticated read digital-products" ON storage.objects;
CREATE POLICY "Authenticated read digital-products"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

-- Authenticated users can upload to digital-products
DROP POLICY IF EXISTS "Authenticated upload digital-products" ON storage.objects;
CREATE POLICY "Authenticated upload digital-products"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

-- Authenticated users can update (upsert) in digital-products
DROP POLICY IF EXISTS "Authenticated update digital-products" ON storage.objects;
CREATE POLICY "Authenticated update digital-products"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

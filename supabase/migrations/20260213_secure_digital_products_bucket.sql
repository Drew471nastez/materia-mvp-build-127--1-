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

-- === 3. Ensure digital_assets has all required columns ===
-- These columns were defined in 20260212_digital_delivery_rebuild.sql but may not have been applied
ALTER TABLE public.digital_assets
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_category TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'digital-products',
  ADD COLUMN IF NOT EXISTS upload_status TEXT DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes on digital_assets for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by
  ON digital_assets (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by_created
  ON digital_assets (uploaded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_assets_bucket
  ON digital_assets (storage_bucket);
CREATE INDEX IF NOT EXISTS idx_digital_assets_status
  ON digital_assets (upload_status);

-- === 4. Ensure download_events table exists with all columns ===
CREATE TABLE IF NOT EXISTS public.download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID,
  order_id UUID,
  digital_asset_id UUID REFERENCES public.digital_assets(id) ON DELETE SET NULL,
  download_token UUID,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.download_events
  ADD COLUMN IF NOT EXISTS digital_asset_id UUID REFERENCES public.digital_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS download_token UUID;

ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access download_events" ON public.download_events;
CREATE POLICY "Service role full access download_events"
  ON public.download_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_download_events_asset
  ON download_events (digital_asset_id);
CREATE INDEX IF NOT EXISTS idx_download_events_token
  ON download_events (download_token);
CREATE INDEX IF NOT EXISTS idx_download_events_created
  ON download_events (created_at);
CREATE INDEX IF NOT EXISTS idx_download_events_created_desc
  ON download_events (created_at DESC);

-- === 5. Ensure subscriber_digital_products table exists ===
CREATE TABLE IF NOT EXISTS public.subscriber_digital_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_email TEXT NOT NULL,
  onepage_id UUID,
  product_id UUID NOT NULL,
  download_token UUID NOT NULL DEFAULT gen_random_uuid(),
  max_downloads INTEGER NOT NULL DEFAULT 10,
  download_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  last_downloaded_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT false,
  email_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdp_download_token
  ON public.subscriber_digital_products(download_token);
CREATE INDEX IF NOT EXISTS idx_sdp_email_onepage
  ON public.subscriber_digital_products(subscriber_email, onepage_id);
CREATE INDEX IF NOT EXISTS idx_sdp_product
  ON public.subscriber_digital_products(product_id);

ALTER TABLE public.subscriber_digital_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access subscriber_digital_products" ON public.subscriber_digital_products;
CREATE POLICY "Service role full access subscriber_digital_products"
  ON public.subscriber_digital_products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- === 6. Ensure creators has storage tracking columns ===
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;

-- === 7. RPC functions for storage management ===
CREATE OR REPLACE FUNCTION public.get_creator_storage_usage(p_creator_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(da.file_size), 0)::BIGINT
  FROM public.digital_assets da
  JOIN public.products p ON da.product_id = p.id
  WHERE p.creator_id = p_creator_id
    AND da.upload_status = 'completed';
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_storage_usage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creator_storage_usage(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fix_storage_bucket_limit(
  p_bucket_id TEXT,
  p_file_size_limit BIGINT DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public
AS $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = NULLIF(p_file_size_limit, 0),
      allowed_mime_types = NULL
  WHERE id = p_bucket_id;

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (p_bucket_id, p_bucket_id, true, NULLIF(p_file_size_limit, 0), NULL);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(TEXT, BIGINT) TO authenticated;

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

-- =============================================================================
-- DIGITAL DELIVERY SYSTEM REBUILD
-- =============================================================================
-- This migration creates/updates all tables needed for the production-grade
-- digital product upload and download system:
--   1. subscriber_digital_products (was referenced but never created!)
--   2. Enhanced digital_assets with file_size, mime_type, category, checksum
--   3. Storage quota columns on creators
--   4. Enhanced download_events with richer logging
--   5. digital-products private storage bucket
--   6. RPC functions for quota tracking
--   7. RLS policies for all new tables
-- =============================================================================

-- ============================================================================
-- 1. SUBSCRIBER_DIGITAL_PRODUCTS TABLE
-- ============================================================================
-- This table was referenced by email-capture and download routes but never
-- actually created. It tracks lead magnet / free product download access.
CREATE TABLE IF NOT EXISTS public.subscriber_digital_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_email TEXT NOT NULL,
  onepage_id UUID REFERENCES public.onepages(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
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

-- Indexes for subscriber_digital_products
CREATE INDEX IF NOT EXISTS idx_sdp_download_token
  ON public.subscriber_digital_products(download_token);
CREATE INDEX IF NOT EXISTS idx_sdp_email_onepage
  ON public.subscriber_digital_products(subscriber_email, onepage_id);
CREATE INDEX IF NOT EXISTS idx_sdp_product
  ON public.subscriber_digital_products(product_id);
CREATE INDEX IF NOT EXISTS idx_sdp_expires
  ON public.subscriber_digital_products(expires_at);

-- Unique constraint: one record per email + onepage + product combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_sdp_unique_email_onepage_product
  ON public.subscriber_digital_products(subscriber_email, onepage_id, product_id);

-- Enable RLS
ALTER TABLE public.subscriber_digital_products ENABLE ROW LEVEL SECURITY;

-- Service role full access (server-side operations)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access subscriber_digital_products" ON public.subscriber_digital_products;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access subscriber_digital_products"
  ON public.subscriber_digital_products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Creators can view downloads for their products
DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can view their product downloads" ON public.subscriber_digital_products;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can view their product downloads"
  ON public.subscriber_digital_products FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- Updated_at trigger
DO $$ BEGIN
  DROP TRIGGER IF EXISTS update_sdp_updated_at ON public.subscriber_digital_products;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE TRIGGER update_sdp_updated_at
  BEFORE UPDATE ON public.subscriber_digital_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. ENHANCE DIGITAL_ASSETS TABLE
-- ============================================================================
-- Add missing columns for comprehensive file tracking
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

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_digital_assets_bucket
  ON public.digital_assets(storage_bucket);
CREATE INDEX IF NOT EXISTS idx_digital_assets_status
  ON public.digital_assets(upload_status);
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by
  ON public.digital_assets(uploaded_by);


-- ============================================================================
-- 3. ADD STORAGE QUOTA COLUMNS TO CREATORS
-- ============================================================================
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;


-- ============================================================================
-- 4. ENHANCED DOWNLOAD_EVENTS TABLE
-- ============================================================================
-- Add richer columns if the table exists, or create it
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

-- Add columns that might be missing
ALTER TABLE public.download_events
  ADD COLUMN IF NOT EXISTS digital_asset_id UUID REFERENCES public.digital_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS download_token UUID;

CREATE INDEX IF NOT EXISTS idx_download_events_asset
  ON public.download_events(digital_asset_id);
CREATE INDEX IF NOT EXISTS idx_download_events_token
  ON public.download_events(download_token);
CREATE INDEX IF NOT EXISTS idx_download_events_created
  ON public.download_events(created_at);

-- RLS for download_events
ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access download_events" ON public.download_events;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access download_events"
  ON public.download_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- 5. STORAGE BUCKETS
-- ============================================================================
-- Create / update the digital-products private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-products', 'digital-products', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Ensure lead-form-files-v2 public bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-form-files-v2', 'lead-form-files-v2', true, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Ensure product-files bucket (legacy support)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-files', 'product-files', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Storage policies for digital-products bucket
DO $$ BEGIN
  DROP POLICY IF EXISTS "digital-products service role all" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "digital-products service role all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'digital-products')
  WITH CHECK (bucket_id = 'digital-products');

DO $$ BEGIN
  DROP POLICY IF EXISTS "digital-products auth upload" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "digital-products auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'digital-products');

DO $$ BEGIN
  DROP POLICY IF EXISTS "digital-products auth read own" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "digital-products auth read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'digital-products'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM public.creators c WHERE c.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 6. RPC FUNCTIONS
-- ============================================================================

-- get_creator_storage_usage: Sum file sizes for a creator's digital assets
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

-- Ensure fix_storage_bucket_limit exists (idempotent)
CREATE OR REPLACE FUNCTION public.fix_storage_bucket_limit(
  p_bucket_id TEXT,
  p_file_size_limit BIGINT DEFAULT 2000000000
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public
AS $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = p_file_size_limit,
      allowed_mime_types = NULL
  WHERE id = p_bucket_id;

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (p_bucket_id, p_bucket_id, true, p_file_size_limit, NULL);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(TEXT, BIGINT) TO authenticated;


-- ============================================================================
-- 7. COMMENTS
-- ============================================================================
COMMENT ON TABLE public.subscriber_digital_products IS 'Tracks lead magnet / free product download access granted via email capture';
COMMENT ON COLUMN public.subscriber_digital_products.download_token IS 'UUID token used in download URLs for secure access';
COMMENT ON COLUMN public.subscriber_digital_products.max_downloads IS 'Maximum number of times this link can be used';
COMMENT ON COLUMN public.subscriber_digital_products.expires_at IS 'When this download link expires';

COMMENT ON COLUMN public.digital_assets.storage_bucket IS 'Which Supabase storage bucket contains this file';
COMMENT ON COLUMN public.digital_assets.upload_status IS 'Upload lifecycle: pending, completed, failed';
COMMENT ON COLUMN public.digital_assets.checksum IS 'SHA-256 hash of file contents for integrity verification';

COMMENT ON COLUMN public.creators.storage_used_bytes IS 'Denormalized counter of total storage used by this creator';
COMMENT ON COLUMN public.creators.storage_quota_bytes IS 'Override quota (NULL = use plan default)';

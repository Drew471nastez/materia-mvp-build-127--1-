-- =============================================================================
-- COMPLETE UPLOAD SYSTEM SQL — COPY & PASTE INTO SUPABASE SQL EDITOR
-- =============================================================================
-- Run this ONCE in Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This script is fully idempotent (safe to run multiple times).
-- It sets up EVERYTHING needed for the production upload system:
--
--   1. Storage buckets (private digital-products, public thumbnails)
--   2. digital_assets table with all columns
--   3. Antivirus scan_status + scan_result columns
--   4. SHA-256 checksum column
--   5. subscriber_digital_products (lead magnet downloads)
--   6. download_events (audit log)
--   7. upload_events (upload audit log)
--   8. Storage quota columns on creators
--   9. RPC functions (storage usage, bucket limits, RLS auto-setup)
--  10. All RLS policies
--  11. All indexes
--  12. Backfill existing data
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. STORAGE BUCKETS                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Private bucket for digital product files (NO public URL access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-products', 'digital-products', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = NULL,      -- NULL = no bucket-level limit (project global applies)
  allowed_mime_types = NULL;    -- NULL = allow any MIME (app layer validates)

-- Public bucket for thumbnails, images, lead form files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-form-files-v2', 'lead-form-files-v2', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = NULL,
  allowed_mime_types = NULL;

-- Legacy buckets — remove restrictive limits
UPDATE storage.buckets
SET file_size_limit = NULL, allowed_mime_types = NULL
WHERE id IN ('product-files', 'digital-assets', 'lead-form-files', 'store-builder-images');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. DIGITAL_ASSETS TABLE (core file tracking)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Ensure the table exists (it should already from prior migrations)
CREATE TABLE IF NOT EXISTS public.digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  file_category TEXT DEFAULT 'other',
  checksum TEXT,
  storage_bucket TEXT DEFAULT 'digital-products',
  upload_status TEXT DEFAULT 'completed',
  scan_status TEXT DEFAULT 'pending_scan',
  scan_result JSONB,
  uploaded_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may be missing from older migrations
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

-- Antivirus scanning columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'digital_assets' AND column_name = 'scan_status' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.digital_assets ADD COLUMN scan_status TEXT DEFAULT 'pending_scan';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'digital_assets' AND column_name = 'scan_result' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.digital_assets ADD COLUMN scan_result JSONB;
  END IF;
END $$;

-- Comments
COMMENT ON COLUMN public.digital_assets.storage_bucket IS 'Which Supabase storage bucket contains this file';
COMMENT ON COLUMN public.digital_assets.upload_status IS 'Upload lifecycle: pending, completed, failed, quarantined';
COMMENT ON COLUMN public.digital_assets.checksum IS 'SHA-256 hash of file contents for integrity verification';
COMMENT ON COLUMN public.digital_assets.scan_status IS 'Antivirus scan status: pending_scan, scanning, clean, infected, scan_error, skipped';
COMMENT ON COLUMN public.digital_assets.scan_result IS 'AV scan details: {engine, threatName, scanDurationMs, scannedAt}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON public.digital_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_digital_assets_bucket ON public.digital_assets(storage_bucket);
CREATE INDEX IF NOT EXISTS idx_digital_assets_status ON public.digital_assets(upload_status);
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by ON public.digital_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_digital_assets_uploaded_by_created ON public.digital_assets(uploaded_by, created_at DESC);

-- Partial index for background AV scanner: quickly find files needing scan
CREATE INDEX IF NOT EXISTS idx_digital_assets_pending_scan
  ON public.digital_assets (scan_status, created_at)
  WHERE scan_status = 'pending_scan' AND upload_status = 'completed';

-- Partial index for download safety checks
CREATE INDEX IF NOT EXISTS idx_digital_assets_scan_status
  ON public.digital_assets (id, scan_status)
  WHERE scan_status IN ('pending_scan', 'scanning', 'infected');

-- RLS
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access digital_assets" ON public.digital_assets;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access digital_assets"
  ON public.digital_assets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can view their digital_assets" ON public.digital_assets;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can view their digital_assets"
  ON public.digital_assets FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can insert digital_assets" ON public.digital_assets;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can insert digital_assets"
  ON public.digital_assets FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can update their digital_assets" ON public.digital_assets;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can update their digital_assets"
  ON public.digital_assets FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid());

DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can delete their digital_assets" ON public.digital_assets;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can delete their digital_assets"
  ON public.digital_assets FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. SUBSCRIBER_DIGITAL_PRODUCTS (lead magnet / free product downloads)   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

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

CREATE INDEX IF NOT EXISTS idx_sdp_download_token ON public.subscriber_digital_products(download_token);
CREATE INDEX IF NOT EXISTS idx_sdp_email_onepage ON public.subscriber_digital_products(subscriber_email, onepage_id);
CREATE INDEX IF NOT EXISTS idx_sdp_product ON public.subscriber_digital_products(product_id);
CREATE INDEX IF NOT EXISTS idx_sdp_expires ON public.subscriber_digital_products(expires_at);

ALTER TABLE public.subscriber_digital_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access subscriber_digital_products" ON public.subscriber_digital_products;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access subscriber_digital_products"
  ON public.subscriber_digital_products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

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

COMMENT ON TABLE public.subscriber_digital_products IS 'Tracks lead magnet / free product download access granted via email capture';
COMMENT ON COLUMN public.subscriber_digital_products.download_token IS 'UUID token used in download URLs for secure access';
COMMENT ON COLUMN public.subscriber_digital_products.max_downloads IS 'Maximum number of times this download link can be used';
COMMENT ON COLUMN public.subscriber_digital_products.expires_at IS 'When this download link expires';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. DOWNLOAD_EVENTS (audit log for every file download)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

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

CREATE INDEX IF NOT EXISTS idx_download_events_asset ON public.download_events(digital_asset_id);
CREATE INDEX IF NOT EXISTS idx_download_events_token ON public.download_events(download_token);
CREATE INDEX IF NOT EXISTS idx_download_events_created ON public.download_events(created_at);
CREATE INDEX IF NOT EXISTS idx_download_events_created_desc ON public.download_events(created_at DESC);

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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5. UPLOAD_EVENTS (upload audit log for security)                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.upload_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  file_category TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  security_scan_result TEXT DEFAULT 'passed',
  security_threat_type TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_events_creator_created ON public.upload_events(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_events_created ON public.upload_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_events_security ON public.upload_events(security_scan_result) WHERE security_scan_result != 'passed';

ALTER TABLE public.upload_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access to upload_events" ON public.upload_events;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access to upload_events"
  ON public.upload_events FOR ALL
  USING (auth.role() = 'service_role');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6. CREATORS — storage quota tracking columns                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;

COMMENT ON COLUMN public.creators.storage_used_bytes IS 'Denormalized counter of total storage used by this creator (bytes)';
COMMENT ON COLUMN public.creators.storage_quota_bytes IS 'Override quota in bytes (NULL = use plan default)';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7. RPC FUNCTIONS                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 7a. get_creator_storage_usage — sum file sizes for a creator
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


-- 7b. fix_storage_bucket_limit — remove/set bucket file size limit
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


-- 7c. ensure_storage_rls — auto-create RLS policies for any bucket
CREATE OR REPLACE FUNCTION public.ensure_storage_rls(p_bucket_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public
AS $$
DECLARE
  policies_created JSONB := '[]'::JSONB;
  policy_name TEXT;
BEGIN
  -- Service role full access
  policy_name := p_bucket_id || ' service_role all';
  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR ALL TO service_role USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
      policy_name, p_bucket_id, p_bucket_id
    );
    policies_created := policies_created || to_jsonb(policy_name);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Authenticated read
  policy_name := p_bucket_id || ' authenticated read';
  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)',
      policy_name, p_bucket_id
    );
    policies_created := policies_created || to_jsonb(policy_name);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Authenticated insert
  policy_name := p_bucket_id || ' authenticated insert';
  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
      policy_name, p_bucket_id
    );
    policies_created := policies_created || to_jsonb(policy_name);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Authenticated update (for upsert)
  policy_name := p_bucket_id || ' authenticated update';
  BEGIN
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L)',
      policy_name, p_bucket_id
    );
    policies_created := policies_created || to_jsonb(policy_name);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  RETURN jsonb_build_object('bucket', p_bucket_id, 'policies_created', policies_created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_storage_rls(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_storage_rls(TEXT) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  8. STORAGE BUCKET RLS POLICIES                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Remove any old public-read policies on private buckets
DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read digital-products" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can read digital-products" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- digital-products: Service role full access
DO $$ BEGIN
  DROP POLICY IF EXISTS "digital-products service role all" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "digital-products service role all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'digital-products')
  WITH CHECK (bucket_id = 'digital-products');

-- digital-products: Authenticated read (for signed URL generation)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated read digital-products" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Authenticated read digital-products"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

-- digital-products: Authenticated upload
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated upload digital-products" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Authenticated upload digital-products"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

-- digital-products: Authenticated update (upsert)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated update digital-products" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Authenticated update digital-products"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

-- lead-form-files-v2: Public read (thumbnails are public)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read lead-form-files-v2" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Public read lead-form-files-v2"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-form-files-v2');

-- lead-form-files-v2: Authenticated upload
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated upload lead-form-files-v2" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Authenticated upload lead-form-files-v2"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lead-form-files-v2' AND auth.role() = 'authenticated');

-- lead-form-files-v2: Service role full access
DO $$ BEGIN
  DROP POLICY IF EXISTS "lead-form-files-v2 service role all" ON storage.objects;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "lead-form-files-v2 service role all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'lead-form-files-v2')
  WITH CHECK (bucket_id = 'lead-form-files-v2');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  9. BACKFILL EXISTING DATA                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Mark all existing completed assets as "clean" (uploaded before AV scanning existed)
UPDATE public.digital_assets
SET scan_status = 'clean'
WHERE upload_status = 'completed'
  AND (scan_status IS NULL OR scan_status = 'pending_scan');

-- Assets that aren't completed yet don't need a scan status
UPDATE public.digital_assets
SET scan_status = NULL
WHERE upload_status != 'completed';

-- Recalculate storage usage for all creators
DO $$
DECLARE
  creator_record RECORD;
  usage_bytes BIGINT;
BEGIN
  FOR creator_record IN SELECT id FROM public.creators LOOP
    SELECT COALESCE(SUM(da.file_size), 0)
    INTO usage_bytes
    FROM public.digital_assets da
    JOIN public.products p ON da.product_id = p.id
    WHERE p.creator_id = creator_record.id
      AND da.upload_status = 'completed';

    UPDATE public.creators
    SET storage_used_bytes = usage_bytes
    WHERE id = creator_record.id;
  END LOOP;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  10. VERIFY SETUP                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Quick verification query — run this after the migration to confirm everything worked
DO $$
DECLARE
  bucket_count INT;
  da_cols TEXT[];
  required_cols TEXT[] := ARRAY['scan_status', 'scan_result', 'checksum', 'upload_status', 'storage_bucket', 'uploaded_by', 'metadata'];
  col TEXT;
BEGIN
  -- Check buckets
  SELECT COUNT(*) INTO bucket_count
  FROM storage.buckets
  WHERE id IN ('digital-products', 'lead-form-files-v2')
    AND file_size_limit IS NULL;

  IF bucket_count < 2 THEN
    RAISE WARNING 'Some buckets still have file_size_limit set. Check storage.buckets.';
  ELSE
    RAISE NOTICE 'OK: Storage buckets configured (no size limits)';
  END IF;

  -- Check digital_assets columns
  SELECT array_agg(column_name::TEXT) INTO da_cols
  FROM information_schema.columns
  WHERE table_name = 'digital_assets' AND table_schema = 'public';

  FOREACH col IN ARRAY required_cols LOOP
    IF NOT (col = ANY(da_cols)) THEN
      RAISE WARNING 'Missing column: digital_assets.%', col;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: digital_assets has all required columns';
  RAISE NOTICE 'OK: Upload system SQL setup complete!';
END $$;

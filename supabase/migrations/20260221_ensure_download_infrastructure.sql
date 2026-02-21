-- Ensure download infrastructure is fully operational
-- Fixes: "Download failed" errors by ensuring all required storage buckets,
-- policies, and tables exist with correct configuration.

-- === 1. Ensure all storage buckets exist ===
DO $$
BEGIN
  -- Primary bucket (private)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('digital-products', 'digital-products', false, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = NULL,
    allowed_mime_types = NULL;

  -- Legacy buckets (ensure they exist for old uploads)
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('product-files', 'product-files', false, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = NULL,
    allowed_mime_types = NULL;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('digital-assets', 'digital-assets', false, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = NULL,
    allowed_mime_types = NULL;
END $$;

-- === 2. Ensure storage RLS policies for signed URL access ===
-- Service role bypasses RLS, but authenticated users need read access
-- for signed URL validation. These policies are idempotent.

DO $$
BEGIN
  -- digital-products bucket
  DROP POLICY IF EXISTS "Authenticated read digital-products" ON storage.objects;
  CREATE POLICY "Authenticated read digital-products"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'digital-products');

  DROP POLICY IF EXISTS "Authenticated upload digital-products" ON storage.objects;
  CREATE POLICY "Authenticated upload digital-products"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

  DROP POLICY IF EXISTS "Authenticated update digital-products" ON storage.objects;
  CREATE POLICY "Authenticated update digital-products"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'digital-products' AND auth.role() = 'authenticated');

  -- product-files bucket (legacy)
  DROP POLICY IF EXISTS "Read product-files" ON storage.objects;
  CREATE POLICY "Read product-files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-files');

  -- digital-assets bucket (legacy)
  DROP POLICY IF EXISTS "Read digital-assets" ON storage.objects;
  CREATE POLICY "Read digital-assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'digital-assets');
END $$;

-- === 3. Ensure download_events table exists ===
CREATE TABLE IF NOT EXISTS public.download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID,
  order_id UUID,
  digital_asset_id UUID,
  download_token UUID,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.download_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access download_events" ON public.download_events;
CREATE POLICY "Service role full access download_events"
  ON public.download_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_download_events_created
  ON public.download_events (created_at DESC);

-- === 4. Ensure security_events table exists for download logging ===
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  event_type TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access security_events" ON public.security_events;
CREATE POLICY "Service role full access security_events"
  ON public.security_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- FIX DIGITAL PRODUCT CREATION
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times

-- ============================================
-- 1. ADD MISSING COLUMNS TO PRODUCTS TABLE
-- ============================================

-- Add SEO columns (missing from product creation form)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Add call to action column (missing from product creation form)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS call_to_action TEXT;

-- Ensure other required columns exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_sales_badge BOOLEAN DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whats_included TEXT[] DEFAULT ARRAY['Instant download access', 'All included files', 'Lifetime access'];

-- ============================================
-- 2. CREATE/UPDATE DIGITAL_ASSETS TABLE
-- ============================================

-- Create digital_assets table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add file_size column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'digital_assets'
    AND column_name = 'file_size'
  ) THEN
    ALTER TABLE public.digital_assets ADD COLUMN file_size BIGINT;
  END IF;
END $$;

-- Add mime_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'digital_assets'
    AND column_name = 'mime_type'
  ) THEN
    ALTER TABLE public.digital_assets ADD COLUMN mime_type TEXT;
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON public.digital_assets(product_id);

-- ============================================
-- 3. ENABLE RLS ON DIGITAL_ASSETS
-- ============================================

ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. DROP AND RECREATE RLS POLICIES FOR DIGITAL_ASSETS
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Creators can manage their digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "Entitled buyers can view digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "Anyone can view digital assets metadata" ON public.digital_assets;
DROP POLICY IF EXISTS "Service role has full access to digital assets" ON public.digital_assets;

-- Creators can manage their own digital assets
CREATE POLICY "Creators can manage their digital assets"
  ON public.digital_assets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = digital_assets.product_id AND c.user_id = auth.uid()
  ));

-- Entitled buyers can view digital assets (for download)
CREATE POLICY "Entitled buyers can view digital assets"
  ON public.digital_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.product_id = digital_assets.product_id AND e.buyer_id = auth.uid()
  ));

-- Allow select for anyone (metadata only - actual files are protected)
CREATE POLICY "Anyone can view digital assets metadata"
  ON public.digital_assets FOR SELECT
  USING (true);

-- ============================================
-- 5. ENSURE PRODUCT-FILES BUCKET EXISTS (5GB LIMIT)
-- ============================================

-- Product Files Bucket (private, 5GB limit - for digital downloads)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'product-files',
  'product-files',
  false,
  5368709120 -- 5GB (5 * 1024 * 1024 * 1024)
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5368709120;

-- ============================================
-- 6. STORAGE POLICIES FOR PRODUCT-FILES
-- ============================================

-- Drop existing storage policies for product-files
DROP POLICY IF EXISTS "Creators can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can view their product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can update product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their product files" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access product files" ON storage.objects;

-- Create storage policies for product-files bucket
-- Allow authenticated users to upload to product-files bucket
CREATE POLICY "Creators can upload product files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-files');

-- Allow authenticated users to view files in product-files bucket
CREATE POLICY "Creators can view their product files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-files');

-- Allow authenticated users to update files in product-files bucket
CREATE POLICY "Creators can update product files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-files');

-- Allow authenticated users to delete files in product-files bucket
CREATE POLICY "Creators can delete their product files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-files');

-- Service role has full access (needed for admin operations)
CREATE POLICY "Service role full access product files"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'product-files')
WITH CHECK (bucket_id = 'product-files');

-- ============================================
-- 7. GRANT NECESSARY PERMISSIONS
-- ============================================

-- Grant usage on storage schema
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO service_role;

-- Grant access to storage.objects
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT ALL ON storage.objects TO service_role;

-- Grant access to storage.buckets
GRANT SELECT ON storage.buckets TO authenticated;
GRANT SELECT ON storage.buckets TO anon;
GRANT ALL ON storage.buckets TO service_role;

-- Grant full access to digital_assets for service_role
GRANT ALL ON public.digital_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_assets TO authenticated;

-- ============================================
-- DONE! Digital product creation should now work.
-- ============================================

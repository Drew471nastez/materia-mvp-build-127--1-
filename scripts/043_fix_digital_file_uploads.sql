-- ============================================
-- FIX DIGITAL FILE UPLOADS
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times

-- ============================================
-- 1. ENSURE PRODUCT-FILES BUCKET EXISTS
-- ============================================

-- Product Files Bucket (private, 1GB limit - for digital downloads)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'product-files',
  'product-files',
  false,
  1073741824 -- 1GB
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 1073741824;

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

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON public.digital_assets(product_id);

-- ============================================
-- 3. ENABLE RLS ON DIGITAL_ASSETS
-- ============================================

ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. DROP AND RECREATE RLS POLICIES
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
-- 5. STORAGE POLICIES FOR PRODUCT-FILES
-- ============================================

-- Drop existing storage policies for product-files
DROP POLICY IF EXISTS "Creators can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can view their product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can update product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their product files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product files" ON storage.objects;

-- Create storage policies for product-files bucket
CREATE POLICY "Creators can upload product files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-files');

CREATE POLICY "Creators can view their product files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-files');

CREATE POLICY "Creators can update product files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-files');

CREATE POLICY "Creators can delete their product files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-files');

-- ============================================
-- 6. GRANT NECESSARY PERMISSIONS
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

-- ============================================
-- DONE! Digital file uploads should now work.
-- ============================================

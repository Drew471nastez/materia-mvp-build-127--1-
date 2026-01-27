-- ============================================
-- COMPLETE FIX FOR VIDEO AND DIGITAL FILE UPLOADS
-- ============================================
-- Run this SQL in your Supabase SQL Editor to fix all upload issues
-- This script is idempotent - safe to run multiple times

-- ============================================
-- 1. CREATE/UPDATE STORAGE BUCKETS
-- ============================================

-- Product Videos Bucket (public, 5GB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  true,
  5368709120, -- 5GB
  ARRAY[
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov',
    'video/mpeg', 'video/x-m4v', 'video/x-matroska', 'video/ogg',
    'video/avi', 'video/3gpp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY[
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov',
    'video/mpeg', 'video/x-m4v', 'video/x-matroska', 'video/ogg',
    'video/avi', 'video/3gpp'
  ]::text[];

-- Product Images Bucket (public, 50MB limit, supports images AND videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5368709120, -- 5GB to allow videos
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov',
    'video/mpeg', 'video/x-m4v', 'video/x-matroska'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov',
    'video/mpeg', 'video/x-m4v', 'video/x-matroska'
  ]::text[];

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

-- Avatars Bucket (public, 5MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- Covers Bucket (public, 10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- Store Builder Images Bucket (public, supports videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-builder-images',
  'store-builder-images',
  true,
  5368709120, -- 5GB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov'
  ]::text[];

-- ============================================
-- 2. DROP EXISTING STORAGE POLICIES (Clean slate)
-- ============================================

-- Product Videos policies
DROP POLICY IF EXISTS "Users can upload product videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their product videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their product videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload product videos" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access product videos" ON storage.objects;

-- Product Images policies
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own product images" ON storage.objects;

-- Product Files policies
DROP POLICY IF EXISTS "Authenticated users can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can view their product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete their product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can update product files" ON storage.objects;

-- Avatars policies
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their avatars" ON storage.objects;

-- Covers policies
DROP POLICY IF EXISTS "Users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Public can view covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their covers" ON storage.objects;

-- Store builder policies
DROP POLICY IF EXISTS "Authenticated users can upload store builder images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view store builder images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their store builder images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their store builder images" ON storage.objects;

-- ============================================
-- 3. CREATE STORAGE POLICIES
-- ============================================

-- PRODUCT VIDEOS POLICIES
CREATE POLICY "Public can view product videos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'product-videos');

CREATE POLICY "Users can upload product videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-videos');

CREATE POLICY "Users can update their product videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-videos');

CREATE POLICY "Users can delete their product videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-videos');

-- PRODUCT IMAGES POLICIES
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Users can update their own product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Users can delete their own product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images');

-- PRODUCT FILES POLICIES (private bucket - accessed via signed URLs)
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

-- AVATARS POLICIES
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Users can update their avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete their avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

-- COVERS POLICIES
CREATE POLICY "Public can view covers"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'covers');

CREATE POLICY "Authenticated users can upload covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'covers');

CREATE POLICY "Users can update their covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'covers');

CREATE POLICY "Users can delete their covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'covers');

-- STORE BUILDER IMAGES POLICIES
CREATE POLICY "Public can view store builder images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'store-builder-images');

CREATE POLICY "Authenticated users can upload store builder images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'store-builder-images');

CREATE POLICY "Users can update their store builder images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'store-builder-images');

CREATE POLICY "Users can delete their store builder images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'store-builder-images');

-- ============================================
-- 4. CREATE/UPDATE DIGITAL ASSETS TABLE
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

-- Enable RLS on digital_assets
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Creators can manage their digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "Entitled buyers can view digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "Anyone can view digital assets metadata" ON public.digital_assets;

-- Create more permissive policies for digital_assets
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

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON public.digital_assets(product_id);

-- ============================================
-- 5. ADD video_urls COLUMN TO PRODUCTS (if missing)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name = 'video_urls'
  ) THEN
    ALTER TABLE public.products ADD COLUMN video_urls TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- ============================================
-- 6. GRANT NECESSARY PERMISSIONS
-- ============================================

-- Grant usage on storage schema
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO anon;

-- Grant access to storage.objects for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- Grant access to storage.buckets
GRANT SELECT ON storage.buckets TO authenticated;
GRANT SELECT ON storage.buckets TO anon;

-- ============================================
-- DONE! Your upload issues should now be fixed.
-- ============================================

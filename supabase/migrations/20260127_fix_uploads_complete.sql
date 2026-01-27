-- ============================================
-- COMPREHENSIVE FIX FOR VIDEO AND FILE UPLOADS
-- ============================================
-- Run this in Supabase SQL Editor to fix all upload issues
-- This script ensures all buckets exist with correct settings and RLS policies

-- ============================================
-- PART 1: ENSURE ALL STORAGE BUCKETS EXIST
-- ============================================

-- Create/Update store-builder-images bucket (for videos and images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-builder-images',
  'store-builder-images',
  true,
  5368709120, -- 5GB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/mpeg', 'video/ogg', 'video/3gpp', 'video/x-ms-wmv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/mpeg', 'video/ogg', 'video/3gpp', 'video/x-ms-wmv'
  ]::text[];

-- Create/Update product-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  104857600, -- 100MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/mpeg'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/mpeg'
  ]::text[];

-- Create/Update product-files bucket (PRIVATE for digital downloads)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'product-files',
  'product-files',
  false,
  1073741824 -- 1GB limit
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 1073741824,
  allowed_mime_types = NULL; -- Allow all file types

-- Create/Update avatars bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- Create/Update covers bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true,
  20971520, -- 20MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- Create/Update lead-form-files bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'lead-form-files',
  'lead-form-files',
  true,
  52428800 -- 50MB
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Create/Update email-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-images',
  'email-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- ============================================
-- PART 2: DROP ALL EXISTING STORAGE POLICIES
-- ============================================
-- (To avoid conflicts and ensure clean setup)

DO $$
DECLARE
  policy_name TEXT;
BEGIN
  -- Drop all existing policies on storage.objects
  FOR policy_name IN
    SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);
  END LOOP;
END $$;

-- ============================================
-- PART 3: CREATE STORAGE POLICIES FOR STORE-BUILDER-IMAGES
-- ============================================

-- Public read access
CREATE POLICY "store_builder_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'store-builder-images');

-- Authenticated users can upload to their own folder
CREATE POLICY "store_builder_images_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own files
CREATE POLICY "store_builder_images_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "store_builder_images_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- PART 4: CREATE STORAGE POLICIES FOR PRODUCT-IMAGES
-- ============================================

-- Public read access
CREATE POLICY "product_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Authenticated users can upload
CREATE POLICY "product_images_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Authenticated users can update
CREATE POLICY "product_images_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- Authenticated users can delete
CREATE POLICY "product_images_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- ============================================
-- PART 5: CREATE STORAGE POLICIES FOR PRODUCT-FILES (PRIVATE)
-- ============================================

-- Authenticated users can read their own files (by user ID folder)
CREATE POLICY "product_files_auth_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can upload to their own folder
CREATE POLICY "product_files_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own files
CREATE POLICY "product_files_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "product_files_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- PART 6: CREATE STORAGE POLICIES FOR AVATARS
-- ============================================

CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- ============================================
-- PART 7: CREATE STORAGE POLICIES FOR COVERS
-- ============================================

CREATE POLICY "covers_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'covers');

CREATE POLICY "covers_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'covers');

CREATE POLICY "covers_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'covers');

CREATE POLICY "covers_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'covers');

-- ============================================
-- PART 8: CREATE STORAGE POLICIES FOR LEAD-FORM-FILES
-- ============================================

CREATE POLICY "lead_form_files_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'lead-form-files');

CREATE POLICY "lead_form_files_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-form-files');

CREATE POLICY "lead_form_files_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-form-files');

CREATE POLICY "lead_form_files_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-form-files');

-- ============================================
-- PART 9: CREATE STORAGE POLICIES FOR EMAIL-IMAGES
-- ============================================

CREATE POLICY "email_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-images');

CREATE POLICY "email_images_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'email-images');

CREATE POLICY "email_images_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'email-images');

CREATE POLICY "email_images_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'email-images');

-- ============================================
-- PART 10: ENSURE DIGITAL_ASSETS TABLE HAS FILE_SIZE COLUMN
-- ============================================

ALTER TABLE public.digital_assets ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- ============================================
-- PART 11: FIX DIGITAL_ASSETS RLS POLICIES
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Creators can manage their digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "Entitled buyers can view digital assets" ON public.digital_assets;
DROP POLICY IF EXISTS "digital_assets_creators_manage" ON public.digital_assets;
DROP POLICY IF EXISTS "digital_assets_buyers_view" ON public.digital_assets;

-- Enable RLS
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

-- Creators can manage (SELECT, INSERT, UPDATE, DELETE) their digital assets
CREATE POLICY "digital_assets_creators_all"
ON public.digital_assets FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = digital_assets.product_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = digital_assets.product_id AND c.user_id = auth.uid()
  )
);

-- Entitled buyers can view digital assets for products they purchased
CREATE POLICY "digital_assets_buyers_select"
ON public.digital_assets FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.product_id = digital_assets.product_id AND e.buyer_id = auth.uid()
  )
);

-- ============================================
-- PART 12: CREATE INDEX FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_digital_assets_product_id ON public.digital_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_digital_assets_created_at ON public.digital_assets(created_at);

-- ============================================
-- DONE! All upload functionality should now work.
-- ============================================

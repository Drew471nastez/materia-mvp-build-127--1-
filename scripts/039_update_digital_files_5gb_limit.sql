-- ============================================
-- UPDATE DIGITAL PRODUCT FILES LIMIT TO 5GB
-- ============================================
-- Run this in your Supabase SQL Editor to update the product-files bucket limit

-- Update the product-files bucket to allow 5GB files
UPDATE storage.buckets
SET file_size_limit = 5368709120  -- 5GB in bytes (5 * 1024 * 1024 * 1024)
WHERE id = 'product-files';

-- If the bucket doesn't exist, create it with 5GB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'product-files',
  'product-files',
  false,
  5368709120 -- 5GB
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5368709120;

-- Ensure RLS policies exist for the bucket
-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Creators can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can view their product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can delete product files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload product files" ON storage.objects;
DROP POLICY IF EXISTS "Creators can update product files" ON storage.objects;

-- Allow authenticated users to upload to product-files bucket
CREATE POLICY "Authenticated users can upload product files"
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
CREATE POLICY "Creators can delete product files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-files');

-- Verify the update
SELECT id, name, public, file_size_limit,
       file_size_limit / (1024 * 1024 * 1024.0) as size_in_gb
FROM storage.buckets
WHERE id = 'product-files';

-- Increase video upload file size limit to 5GB
-- This migration ensures the store-builder-images bucket can handle large video uploads

-- First, ensure the bucket exists with proper settings
DO $$
BEGIN
  -- Check if bucket exists
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'store-builder-images') THEN
    -- Create the bucket if it doesn't exist
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'store-builder-images',
      'store-builder-images',
      true,
      5368709120, -- 5GB limit (5 * 1024 * 1024 * 1024)
      ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v']::text[]
    );
  ELSE
    -- Update existing bucket to have 5GB limit
    UPDATE storage.buckets
    SET
      file_size_limit = 5368709120, -- 5GB limit (5 * 1024 * 1024 * 1024)
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v']::text[]
    WHERE id = 'store-builder-images';
  END IF;
END $$;

-- Also update product-images bucket if it exists (for consistency)
UPDATE storage.buckets
SET
  file_size_limit = 5368709120, -- 5GB limit
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v']::text[]
WHERE id = 'product-images';

-- Ensure RLS policies exist for store-builder-images bucket
DO $$
BEGIN
  -- Drop existing policies if they exist and recreate them
  DROP POLICY IF EXISTS "Users can upload to own folder" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
  DROP POLICY IF EXISTS "Public read access for store-builder-images" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- Policy doesn't exist, that's fine
END $$;

-- Create policies for store-builder-images
CREATE POLICY "Users can upload to own folder in store-builder-images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own files in store-builder-images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files in store-builder-images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'store-builder-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Public read access for store-builder-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-builder-images');

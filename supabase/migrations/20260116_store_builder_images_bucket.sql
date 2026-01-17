-- Create store-builder-images bucket for custom benefit icons and other store builder images
-- This migration ensures the bucket exists and has proper RLS policies

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-builder-images',
  'store-builder-images',
  true,
  1073741824, -- 1GB limit for videos
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1073741824,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov']::text[];

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Users can upload store builder images" ON storage.objects;
CREATE POLICY "Users can upload store builder images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-builder-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow authenticated users to update their own images
DROP POLICY IF EXISTS "Users can update their store builder images" ON storage.objects;
CREATE POLICY "Users can update their store builder images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-builder-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'store-builder-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow authenticated users to delete their own images
DROP POLICY IF EXISTS "Users can delete their store builder images" ON storage.objects;
CREATE POLICY "Users can delete their store builder images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-builder-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow public read access to all images in the bucket
DROP POLICY IF EXISTS "Public can view store builder images" ON storage.objects;
CREATE POLICY "Public can view store builder images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'store-builder-images');

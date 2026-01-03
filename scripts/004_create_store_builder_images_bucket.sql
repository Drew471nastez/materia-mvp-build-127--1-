-- Create the store-builder-images bucket for Store Builder uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-builder-images', 'store-builder-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to their own store-builder folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-builder-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own files
CREATE POLICY "Users can update their own store-builder files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-builder-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own store-builder files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-builder-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access so images can be displayed on live stores
CREATE POLICY "Public read access for store-builder images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'store-builder-images');

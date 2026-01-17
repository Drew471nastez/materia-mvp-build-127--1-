-- Update store-builder-images bucket to support video uploads up to 2GB
-- This migration updates existing buckets to allow video files

UPDATE storage.buckets
SET
  file_size_limit = 2147483648, -- 2GB limit for videos
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov']::text[]
WHERE id = 'store-builder-images';

-- Remove file size limits on storage buckets
-- file_size_limit = 0 means NO limit in Supabase Storage
-- (the check is: IF file_size_limit > 0 AND file_size > file_size_limit THEN reject)
-- This allows uploading files of any size (audio, video, ZIP, images, docs, etc.)

-- Fix lead-form-files-v2 bucket: set file_size_limit = 0 (no limit), allow all MIME types
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files-v2',
  'lead-form-files-v2',
  true,
  0,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 0,
  allowed_mime_types = NULL;

-- Fix legacy lead-form-files bucket too
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files',
  'lead-form-files',
  true,
  0,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 0,
  allowed_mime_types = NULL;

-- Fix product-files bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-files',
  'product-files',
  false,
  0,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 0,
  allowed_mime_types = NULL;

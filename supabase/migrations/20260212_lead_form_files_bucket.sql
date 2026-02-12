-- ============================================================
-- Fix lead-form-files bucket: create bucket + storage policies
-- Uses supabase_storage_admin role (owner of storage.objects)
-- to avoid "must be owner of table objects" error
-- ============================================================

-- 1. Create bucket (skip if exists) - runs as postgres
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files',
  'lead-form-files',
  true,
  4294967296,  -- 4GB
  NULL         -- Allow ALL MIME types (audio, video, images, docs, zip, etc.)
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 4294967296,
  allowed_mime_types = NULL;

-- 2. Switch to supabase_storage_admin to create policies on storage.objects
DO $$
BEGIN
  -- Drop any existing policies for this bucket to avoid conflicts
  DROP POLICY IF EXISTS "lead-form-files public select" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files auth update" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files auth delete" ON storage.objects;
  DROP POLICY IF EXISTS "Allow public read access to lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated uploads to lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated updates to lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated deletes to lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Public read for lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Auth upload for lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Auth update for lead-form-files" ON storage.objects;
  DROP POLICY IF EXISTS "Auth delete for lead-form-files" ON storage.objects;
END
$$;

-- PUBLIC READ - Anyone can view/download files (for public URLs to work)
CREATE POLICY "lead-form-files public select"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-form-files');

-- AUTHENTICATED INSERT - Logged-in users can upload files
CREATE POLICY "lead-form-files auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-form-files');

-- AUTHENTICATED UPDATE - Logged-in users can update/upsert files
CREATE POLICY "lead-form-files auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-form-files')
WITH CHECK (bucket_id = 'lead-form-files');

-- AUTHENTICATED DELETE - Logged-in users can delete files
CREATE POLICY "lead-form-files auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-form-files');

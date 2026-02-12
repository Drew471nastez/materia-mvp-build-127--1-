-- Comprehensive fix for lead-form-files-v2 bucket
-- Ensures bucket exists, has correct 5GB limit, allows all MIME types,
-- and has proper RLS policies for both authenticated users and service_role.

-- 1. Create or update the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files-v2',
  'lead-form-files-v2',
  true,
  2000000000,  -- 5GB (fits within int8/bigint)
  NULL         -- NULL = allow all MIME types
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- 2. Drop existing policies to avoid duplicates
DO $$
BEGIN
  DROP POLICY IF EXISTS "lead-form-files-v2 public select" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth update" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth delete" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 service role all" ON storage.objects;
END
$$;

-- 3. Public read access (anyone can view/download files)
CREATE POLICY "lead-form-files-v2 public select"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-form-files-v2');

-- 4. Authenticated users can upload files
CREATE POLICY "lead-form-files-v2 auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-form-files-v2');

-- 5. Authenticated users can update their files
CREATE POLICY "lead-form-files-v2 auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-form-files-v2')
WITH CHECK (bucket_id = 'lead-form-files-v2');

-- 6. Authenticated users can delete their files
CREATE POLICY "lead-form-files-v2 auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-form-files-v2');

-- 7. Service role has full access (for admin/server-side operations)
CREATE POLICY "lead-form-files-v2 service role all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'lead-form-files-v2')
WITH CHECK (bucket_id = 'lead-form-files-v2');

-- 8. Also ensure the product-files bucket exists for digital product downloads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-files',
  'product-files',
  false,
  2000000000,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- 9. Service role access for product-files bucket
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role full access product files" ON storage.objects;
END
$$;

CREATE POLICY "Service role full access product files"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'product-files')
WITH CHECK (bucket_id = 'product-files');

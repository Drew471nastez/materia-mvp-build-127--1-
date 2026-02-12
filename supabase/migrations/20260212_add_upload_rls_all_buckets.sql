-- Add RLS policies for ALL storage buckets so the browser Supabase client
-- can upload files directly using TUS (chunked) protocol.
-- The TUS upload bypasses the API gateway body size limit (~50MB) by sending
-- small 6MB chunks instead of one large request.

-- ==========================================
-- digital-products bucket (private)
-- ==========================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "digital-products auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "digital-products auth update" ON storage.objects;
  DROP POLICY IF EXISTS "digital-products service role all" ON storage.objects;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-products', 'digital-products', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Authenticated users can upload
CREATE POLICY "digital-products auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'digital-products');

-- Authenticated users can update/overwrite (needed for upsert: true)
CREATE POLICY "digital-products auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'digital-products')
WITH CHECK (bucket_id = 'digital-products');

-- Service role has full access
CREATE POLICY "digital-products service role all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'digital-products')
WITH CHECK (bucket_id = 'digital-products');

-- ==========================================
-- product-files bucket (private, legacy)
-- ==========================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "product-files auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "product-files auth update" ON storage.objects;
  DROP POLICY IF EXISTS "product-files service role all" ON storage.objects;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-files', 'product-files', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

CREATE POLICY "product-files auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-files');

CREATE POLICY "product-files auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-files')
WITH CHECK (bucket_id = 'product-files');

CREATE POLICY "product-files service role all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'product-files')
WITH CHECK (bucket_id = 'product-files');

-- ==========================================
-- lead-form-files-v2 bucket (public) — ensure policies exist
-- ==========================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "lead-form-files-v2 public select" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth update" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth delete" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 service role all" ON storage.objects;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-form-files-v2', 'lead-form-files-v2', true, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

CREATE POLICY "lead-form-files-v2 public select"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-form-files-v2');

CREATE POLICY "lead-form-files-v2 auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-form-files-v2');

CREATE POLICY "lead-form-files-v2 auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'lead-form-files-v2')
WITH CHECK (bucket_id = 'lead-form-files-v2');

CREATE POLICY "lead-form-files-v2 auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-form-files-v2');

CREATE POLICY "lead-form-files-v2 service role all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'lead-form-files-v2')
WITH CHECK (bucket_id = 'lead-form-files-v2');

-- Verify
SELECT id, name, public, file_size_limit FROM storage.buckets
WHERE id IN ('lead-form-files-v2', 'digital-products', 'product-files');

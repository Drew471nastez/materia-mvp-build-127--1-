-- Create a fresh bucket for lead-form digital files to avoid legacy bucket misconfiguration.
-- New uploads should use this bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files-v2',
  'lead-form-files-v2',
  true,
  2000000000,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  DROP POLICY IF EXISTS "lead-form-files-v2 public select" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth insert" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth update" ON storage.objects;
  DROP POLICY IF EXISTS "lead-form-files-v2 auth delete" ON storage.objects;
END
$$;

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

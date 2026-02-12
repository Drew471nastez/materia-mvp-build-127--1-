-- Raise lead-form-files bucket object size limit to 5GB and keep all MIME types allowed.
-- NOTE: this cannot bypass your Supabase project's overall storage quota.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files',
  'lead-form-files',
  true,
  5368709120,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

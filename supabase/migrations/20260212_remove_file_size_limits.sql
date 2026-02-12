-- Set very large file_size_limit on storage buckets to allow uploading any file size.
-- Using 2000000000 (~2GB, fits int4 max 2,147,483,647) because:
--   - 0 or NULL falls back to Supabase global default (often 50MB)
--   - A large positive number overrides the global default
-- Also clears allowed_mime_types (NULL = allow all file types).

-- Fix lead-form-files-v2 bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files-v2',
  'lead-form-files-v2',
  true,
  2000000000,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Fix legacy lead-form-files bucket too
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-form-files',
  'lead-form-files',
  true,
  2000000000,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2000000000,
  allowed_mime_types = NULL;

-- Fix product-files bucket
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

-- Create an RPC function that the app can call at runtime to force-fix bucket limits.
-- Uses SECURITY DEFINER to run with the function owner's permissions (can modify storage schema).
CREATE OR REPLACE FUNCTION public.fix_storage_bucket_limit(
  p_bucket_id text,
  p_file_size_limit bigint DEFAULT 2000000000
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public
AS $$
BEGIN
  UPDATE storage.buckets
  SET file_size_limit = p_file_size_limit,
      allowed_mime_types = NULL
  WHERE id = p_bucket_id;

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (p_bucket_id, p_bucket_id, true, p_file_size_limit, NULL);
  END IF;
END;
$$;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO authenticated;

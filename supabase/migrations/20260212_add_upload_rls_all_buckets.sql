-- ==========================================
-- RPC function: ensure_storage_rls
-- Auto-creates RLS policies for a given bucket so browser TUS uploads work.
-- Called from the upload prepare endpoint; idempotent.
-- ==========================================
CREATE OR REPLACE FUNCTION public.ensure_storage_rls(p_bucket_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = storage, public AS $$
DECLARE
  pol text;
  created text[] := '{}';
BEGIN
  -- authenticated SELECT (needed for upsert duplicate checks)
  pol := p_bucket_id || ' auth select';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  -- authenticated INSERT
  pol := p_bucket_id || ' auth insert';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  -- authenticated UPDATE (needed for upsert overwrite)
  pol := p_bucket_id || ' auth update';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id=%L) WITH CHECK (bucket_id=%L)', pol, p_bucket_id, p_bucket_id);
    created := created || pol;
  END IF;

  -- authenticated DELETE
  pol := p_bucket_id || ' auth delete';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  -- public/anon SELECT (for public buckets & download)
  pol := p_bucket_id || ' anon select';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO anon USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  -- service_role ALL
  pol := p_bucket_id || ' service all';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR ALL TO service_role USING (bucket_id=%L) WITH CHECK (bucket_id=%L)', pol, p_bucket_id, p_bucket_id);
    created := created || pol;
  END IF;

  RETURN jsonb_build_object('bucket', p_bucket_id, 'created', to_jsonb(created));
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_storage_rls(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_storage_rls(text) TO authenticated;

-- ==========================================
-- Buckets: create/update with 2 GB limit
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-form-files-v2','lead-form-files-v2', true, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=2000000000, allowed_mime_types=NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-products','digital-products', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit=2000000000, allowed_mime_types=NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-files','product-files', false, 2000000000, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit=2000000000, allowed_mime_types=NULL;

-- ==========================================
-- Auto-create policies for all known buckets
-- ==========================================
SELECT public.ensure_storage_rls('lead-form-files-v2');
SELECT public.ensure_storage_rls('digital-products');
SELECT public.ensure_storage_rls('product-files');

-- Also keep the existing fix_storage_bucket_limit helper
CREATE OR REPLACE FUNCTION public.fix_storage_bucket_limit(p_bucket_id text, p_file_size_limit bigint DEFAULT 2000000000)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = storage, public AS $$
BEGIN
  UPDATE storage.buckets SET file_size_limit = p_file_size_limit, allowed_mime_types = NULL WHERE id = p_bucket_id;
  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (p_bucket_id, p_bucket_id, true, p_file_size_limit, NULL);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO authenticated;

-- ==========================================
-- Verify
-- ==========================================
SELECT id, public, file_size_limit FROM storage.buckets
WHERE id IN ('lead-form-files-v2','digital-products','product-files');

SELECT schemaname, tablename, policyname, roles
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname LIKE ANY(ARRAY['lead-form-files-v2%','digital-products%','product-files%'])
ORDER BY policyname;

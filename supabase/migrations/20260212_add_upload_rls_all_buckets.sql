-- ==========================================
-- Strategy: Set file_size_limit to NULL (removes bucket-level check entirely).
-- In Supabase Storage, NULL/0 means "no bucket limit" — only the project-level
-- global limit applies. This avoids issues with Supabase capping/caching the value.
-- ==========================================

-- ==========================================
-- RPC: ensure_storage_rls — auto-creates RLS policies for a bucket
-- ==========================================
CREATE OR REPLACE FUNCTION public.ensure_storage_rls(p_bucket_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = storage, public AS $$
DECLARE
  pol text;
  created text[] := '{}';
BEGIN
  pol := p_bucket_id || ' auth select';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  pol := p_bucket_id || ' auth insert';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  pol := p_bucket_id || ' auth update';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id=%L) WITH CHECK (bucket_id=%L)', pol, p_bucket_id, p_bucket_id);
    created := created || pol;
  END IF;

  pol := p_bucket_id || ' auth delete';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

  pol := p_bucket_id || ' anon select';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname=pol) THEN
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO anon USING (bucket_id=%L)', pol, p_bucket_id);
    created := created || pol;
  END IF;

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
-- RPC: fix_storage_bucket_limit — sets file_size_limit (0 = no limit)
-- ==========================================
CREATE OR REPLACE FUNCTION public.fix_storage_bucket_limit(p_bucket_id text, p_file_size_limit bigint DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = storage, public AS $$
BEGIN
  IF p_file_size_limit = 0 THEN
    UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = p_bucket_id;
  ELSE
    UPDATE storage.buckets SET file_size_limit = p_file_size_limit, allowed_mime_types = NULL WHERE id = p_bucket_id;
  END IF;
  IF NOT FOUND THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (p_bucket_id, p_bucket_id, true, NULLIF(p_file_size_limit, 0), NULL);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_storage_bucket_limit(text, bigint) TO authenticated;

-- ==========================================
-- Buckets: create if missing, set file_size_limit = NULL (no bucket-level limit)
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-form-files-v2', 'lead-form-files-v2', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = NULL, allowed_mime_types = NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-products', 'digital-products', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = NULL, allowed_mime_types = NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-files', 'product-files', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = NULL, allowed_mime_types = NULL;

-- ==========================================
-- Create RLS policies for all buckets
-- ==========================================
SELECT public.ensure_storage_rls('lead-form-files-v2');
SELECT public.ensure_storage_rls('digital-products');
SELECT public.ensure_storage_rls('product-files');

-- ==========================================
-- Verify
-- ==========================================
SELECT id, public, file_size_limit FROM storage.buckets
WHERE id IN ('lead-form-files-v2', 'digital-products', 'product-files');

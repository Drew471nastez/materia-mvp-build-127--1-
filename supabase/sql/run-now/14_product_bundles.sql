/* The product_bundles table the download ZIPs are cached in (missing in production). */
CREATE TABLE IF NOT EXISTS public.product_bundles ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE, zip_path TEXT NOT NULL, zip_file_name TEXT NOT NULL, zip_size BIGINT NOT NULL DEFAULT 0, file_count INTEGER NOT NULL DEFAULT 0, files_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW() );
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bundles_product_no_variant ON public.product_bundles(product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bundles_product_with_variant ON public.product_bundles(product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_bundles_product_id ON public.product_bundles(product_id);
ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access product_bundles" ON public.product_bundles; EXCEPTION WHEN undefined_object THEN NULL; END $$;
CREATE POLICY "Service role full access product_bundles" ON public.product_bundles FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$ BEGIN DROP POLICY IF EXISTS "Creators can view product bundles" ON public.product_bundles; EXCEPTION WHEN undefined_object THEN NULL; END $$;
CREATE POLICY "Creators can view product bundles" ON public.product_bundles FOR SELECT TO authenticated USING ( product_id IN ( SELECT p.id FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE c.user_id = auth.uid() ) );
DO $$ BEGIN IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $fn$; END IF; END $$;
CREATE OR REPLACE TRIGGER update_product_bundles_updated_at BEFORE UPDATE ON public.product_bundles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.product_bundles IS 'Cached ZIP bundles for digital products with ≥6 files';
COMMENT ON COLUMN public.product_bundles.files_hash IS 'Sorted file IDs + product title — used to detect when regeneration is needed';
COMMENT ON COLUMN public.product_bundles.variant_id IS 'NULL = product-level bundle; set = variant-specific bundle';
notify pgrst, 'reload schema';

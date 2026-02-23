-- =============================================================================
-- PRODUCT BUNDLES TABLE
-- =============================================================================
-- Caches auto-generated ZIP files for digital products with ≥6 files.
-- ZIP is generated once on save/publish and reused for every buyer download.
-- Avoids re-zipping on every download (timeouts, wasted compute, slow UX).
--
-- Keyed on (product_id, variant_id) — variant_id IS NULL for product-level bundles.
-- files_hash detects when the file set or product title has changed so the ZIP
-- is regenerated automatically on the next save/publish.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_bundles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id   UUID        REFERENCES public.product_variants(id) ON DELETE CASCADE,
  -- Storage path for the ZIP (stable — not timestamp-based, uses upsert)
  zip_path     TEXT        NOT NULL,
  zip_file_name TEXT       NOT NULL,
  zip_size     BIGINT      NOT NULL DEFAULT 0,
  file_count   INTEGER     NOT NULL DEFAULT 0,
  -- Sorted file-IDs joined with commas + ":" + product_title
  -- Lets us skip regeneration when nothing has changed.
  files_hash   TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique indexes — PostgreSQL handles NULL variant_id correctly this way
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bundles_product_no_variant
  ON public.product_bundles(product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bundles_product_with_variant
  ON public.product_bundles(product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_bundles_product_id
  ON public.product_bundles(product_id);

-- Enable RLS
ALTER TABLE public.product_bundles ENABLE ROW LEVEL SECURITY;

-- Service role: full access (used by all API routes)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access product_bundles" ON public.product_bundles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Service role full access product_bundles"
  ON public.product_bundles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Creators can read their own product bundles
DO $$ BEGIN
  DROP POLICY IF EXISTS "Creators can view product bundles" ON public.product_bundles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE POLICY "Creators can view product bundles"
  ON public.product_bundles FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id
      FROM   public.products  p
      JOIN   public.creators  c ON p.creator_id = c.id
      WHERE  c.user_id = auth.uid()
    )
  );

-- updated_at auto-maintenance
CREATE OR REPLACE TRIGGER update_product_bundles_updated_at
  BEFORE UPDATE ON public.product_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE  public.product_bundles         IS 'Cached ZIP bundles for digital products with ≥6 files';
COMMENT ON COLUMN public.product_bundles.files_hash IS 'Sorted file IDs + product title — used to detect when regeneration is needed';
COMMENT ON COLUMN public.product_bundles.variant_id IS 'NULL = product-level bundle; set = variant-specific bundle';

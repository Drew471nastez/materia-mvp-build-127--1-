-- ============================================================================
-- The variants policy was the product page — 2026-09-16
-- ============================================================================
-- Measured on production with lib/perf/phase-timer.ts, one query was between
-- 40% and 86% of the whole server render of a product page:
--
--     total=3827  creatorAndConfig=21  user=0  assets=503  variants=3302
--     total=2882  creatorAndConfig=35  user=0  assets=38   variants=2808
--     total=367   creatorAndConfig=62  user=0  assets=166  variants=139
--
-- It is not a missing index. scripts/045 and scripts/048 both create
-- idx_product_variants_product and idx_product_variant_files_variant.
--
-- It is the row-level security policy, which looked like this:
--
--     USING (
--       EXISTS (SELECT 1 FROM products p
--               WHERE p.id = product_variants.product_id AND p.status = 'published')
--       OR EXISTS (SELECT 1 FROM products p JOIN creators c ON p.creator_id = c.id
--                  WHERE p.id = product_variants.product_id AND c.user_id = auth.uid())
--     )
--
-- Two things make that expensive, and they compound:
--
--   1. `auth.uid()` is called PER ROW. Postgres treats it as volatile in this
--      position, so it cannot hoist it into an InitPlan and run it once.
--      Wrapping it as `(SELECT auth.uid())` makes it a scalar subquery, which
--      the planner DOES hoist. This is the single biggest lever on a Supabase
--      policy and it changes no behaviour at all.
--
--   2. A SIGNED-OUT VISITOR PAID FOR THE CREATOR BRANCH ANYWAY. `OR` inside one
--      policy means both halves are part of one expression, so every anonymous
--      read of a variant also joined products to creators to compare against a
--      uid that was null. Split into two permissive policies the result is
--      identical — PostgreSQL ORs permissive policies together — but the
--      creator branch is scoped `TO authenticated` and a visitor never
--      evaluates it.
--
-- And it is evaluated on the two tables joined to the variants as well, which
-- is why the nested select in the product page felt so much worse than the
-- row count suggests.
--
-- Safe to re-run: every policy is dropped by name first.
-- ============================================================================

-- ── product_variants ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view variants for published products" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can view their own variants" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their own variants" ON public.product_variants;

-- The cheap half, and the only one a signed-out visitor evaluates.
CREATE POLICY "Anyone can view variants for published products"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.status = 'published'
    )
  );

-- A creator seeing their own drafts. Permissive, so this ORs with the above.
CREATE POLICY "Creators can view their own variants"
  ON public.product_variants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Creators can manage their own variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- ── product_variant_files ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Public can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can view their own variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their own variant files" ON public.product_variant_files;

CREATE POLICY "Public can view variant files for published products"
  ON public.product_variant_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variant_files.variant_id
        AND p.status = 'published'
    )
  );

CREATE POLICY "Creators can view their own variant files"
  ON public.product_variant_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Creators can manage their own variant files"
  ON public.product_variant_files FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- ── the two indexes the EXISTS clauses above want ───────────────────────────
-- Both already exist in scripts/045 and scripts/053. Repeated here so that
-- applying this file alone is enough, and IF NOT EXISTS makes that free.

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant
  ON public.product_variant_files (variant_id);

-- Reviews and the course outline are read on every product page and had no
-- index on the column they filter by.
CREATE INDEX IF NOT EXISTS idx_reviews_product_created
  ON public.reviews (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_product
  ON public.courses (product_id);

NOTIFY pgrst, 'reload schema';

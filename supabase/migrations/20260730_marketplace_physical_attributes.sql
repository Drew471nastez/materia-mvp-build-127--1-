-- ============================================================================
-- Marketplace Physical Attributes — 2026-07-30
-- Storelib is pivoting from a digital-products marketplace into a Depop/Vinted
-- style marketplace for tangible, mostly second-hand goods (fashion, sneakers,
-- books, home, vintage). Resale listings are described by attributes the
-- digital schema never needed: what size it is, what condition it's in, what
-- brand made it and what colour it is.
--
-- This migration adds those five attributes to public.products, constrains the
-- two closed vocabularies, indexes them for feed filtering, and teaches the
-- full-text search vector about brand (on a resale marketplace the brand *is*
-- the query — "nike", "carhartt" — and it often never appears in the title).
--
-- Every statement is idempotent; this migration is safe to re-run.
-- Nothing here is destructive: no column is dropped, no row is rewritten and
-- no RLS policy is touched.
-- ============================================================================

-- pg_trgm is already enabled by 20260225_search_trigram.sql; re-asserted here
-- because the brand autocomplete index below depends on it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- PART 1: NEW COLUMNS
-- ============================================================================
-- All five are nullable with no default. A default would falsely mark every
-- existing digital row as having a condition, and would destroy the usefulness
-- of `WHERE condition IS NOT NULL` as a "is this a tangible listing" probe.
-- Nullable also means existing insert paths (the product form, duplicate_product,
-- the legacy edit form) keep working untouched.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size_system TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS color TEXT;

-- COMMENT ON COLUMN is inherently idempotent (it overwrites), so these sit
-- outside the guards and always reflect the current intent.
COMMENT ON COLUMN public.products.size IS
  'Display size label exactly as the seller entered it: M, 42, UK 9, One size, 30W 32L. NULL for items with no size (books, most home/vintage). Deliberately not normalised — see size_system for disambiguation.';

COMMENT ON COLUMN public.products.size_system IS
  'Disambiguates size: alpha, eu, uk, us, numeric, one-size. NULL when size is NULL or the system is unknown.';

COMMENT ON COLUMN public.products.condition IS
  'Second-hand condition ladder: new_with_tags, new_without_tags, very_good, good, satisfactory. NULL for digital products and unspecified listings.';

COMMENT ON COLUMN public.products.brand IS
  'Free-text seller-entered brand. No CHECK — brand vocabulary is open-ended and long-tail; normalisation belongs in a future brands lookup table. Feeds the search vector at weight A.';

COMMENT ON COLUMN public.products.color IS
  'Free-text primary colour. American spelling to match creators.brand_color and the rest of the codebase; UI labels may read "Colour".';

-- ============================================================================
-- PART 2: CHECK CONSTRAINTS ON THE CLOSED VOCABULARIES
-- ============================================================================
-- TEXT + CHECK rather than a Postgres enum, matching every other constrained
-- column in this schema (products.type, products.status, products.refund_policy_type,
-- coupons.discount_type). There are no enums anywhere in this database, and
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction that uses the new
-- value — which would make extending this taxonomy painful later.
--
-- ADD CONSTRAINT is not idempotent the way ADD COLUMN IF NOT EXISTS is, so each
-- is guarded on pg_constraint. Both forms spell out `IS NULL OR` even though a
-- bare IN would also pass NULLs, so the intent survives a future SET NOT NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_condition_check'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_condition_check
      CHECK (condition IS NULL OR condition IN (
        'new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_size_system_check'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_size_system_check
      CHECK (size_system IS NULL OR size_system IN (
        'alpha', 'eu', 'uk', 'us', 'numeric', 'one-size'
      ));
  END IF;
END $$;

-- ============================================================================
-- PART 3: ALLOW 'physical' AS A PRODUCT TYPE
-- ============================================================================
-- products.type is still CHECK (type IN ('digital','course','community')) from
-- scripts/003_create_products.sql. The pivot needs a fourth value so the seller
-- flow can list a tangible item. Widening it now avoids a second migration
-- round-trip later.
--
-- NO ROW IS MIGRATED and no code path writes 'physical' yet — the product form
-- state is still typed "digital" | "course", and product-card.tsx / the product
-- detail page branch on type in ways that would render a physical item wrongly.
-- This is schema-forward only.
--
-- The swap only runs when the existing constraint is found, which is exactly
-- the case where it is provably safe: every row already satisfies the narrower
-- three-value check, so the widened four-value check cannot fail validation.
-- Skipped entirely once 'physical' is already allowed, so re-running costs
-- nothing (no repeat full-table validation scan).
-- 'physical' is the established spelling — scripts/024_create_categories.sql
-- already uses it on the separate categories table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_type_check'
    AND conrelid = 'public.products'::regclass
    AND pg_get_constraintdef(oid) NOT LIKE '%physical%'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_type_check;

    ALTER TABLE public.products
      ADD CONSTRAINT products_type_check
      CHECK (type IN ('digital', 'course', 'community', 'physical'));
  END IF;
END $$;

-- ============================================================================
-- PART 4: FEED + FACET INDEXES
-- ============================================================================
-- No CONCURRENTLY: this migration runs inside a transaction.

-- The highest-value index here, and one that is currently missing: the only
-- published-products index today is (status, created_at DESC), so every category
-- page filters then sorts across all published rows. `status` is omitted from
-- the key because the partial predicate already pins it to a single value.
CREATE INDEX IF NOT EXISTS idx_products_published_category_created
  ON public.products (category, created_at DESC)
  WHERE status = 'published';

-- One partial index per facet rather than a single wide composite. Postgres can
-- BitmapAnd several of these for arbitrary facet combinations, which is the
-- right shape for a multi-select filter sheet; a composite would only ever serve
-- one prefix order.
CREATE INDEX IF NOT EXISTS idx_products_condition_created
  ON public.products (condition, created_at DESC)
  WHERE status = 'published' AND condition IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_size
  ON public.products (size)
  WHERE status = 'published' AND size IS NOT NULL;

-- lower(...) expression indexes because the app filters case-insensitively
-- throughout — app/api/v2/search/route.ts compares LOWER(COALESCE(p.category,''))
-- and the fallback path uses .ilike(). Brand and colour filters follow suit.
CREATE INDEX IF NOT EXISTS idx_products_brand_lower
  ON public.products (lower(brand))
  WHERE status = 'published' AND brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_color_lower
  ON public.products (lower(color))
  WHERE status = 'published' AND color IS NOT NULL;

-- Trigram index for brand autocomplete / fuzzy brand matching ("carhart" →
-- "Carhartt"), mirroring idx_products_title_trgm.
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING GIN (brand gin_trgm_ops)
  WHERE status = 'published';

-- Note: six new partial indexes add write amplification on an actively-edited
-- table. Negligible at MVP row counts. 20260225_db_hygiene.sql documents the
-- pg_stat_user_indexes query for pruning unused ones later.

-- ============================================================================
-- PART 5: EXTEND THE SEARCH VECTOR WITH brand
-- ============================================================================
-- Mechanism confirmed against 20260225_search_trigram.sql: search_vector is a
-- plain tsvector column maintained by a BEFORE INSERT OR UPDATE OF trigger, NOT
-- a GENERATED ALWAYS AS ... STORED column. So it is extended by replacing the
-- function AND recreating the trigger.
--
-- Brand is weighted A, the same as title, because on a resale marketplace the
-- brand is what people type. Drop to weight B if relevance regressions appear.
--
-- Not converting search_vector to a generated column: that would require
-- dropping and re-adding the column, rebuilding the GIN index under an ACCESS
-- EXCLUSIVE lock, and to_tsvector('english', ...) is only immutable enough for
-- a generated column when the config is spelled as a literal regconfig, which
-- is fragile across environments.

CREATE OR REPLACE FUNCTION public.update_product_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$;

-- The trigger MUST be recreated, not just the function. The `UPDATE OF <cols>`
-- clause means the trigger only fires when one of the listed columns appears in
-- the SET list — without `brand` there, a seller editing only the brand would
-- leave a stale search_vector forever. CREATE OR REPLACE on the function alone
-- does not change the trigger's column list.
DROP TRIGGER IF EXISTS trg_products_search_vector ON public.products;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF title, description, brand ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_search_vector();

-- Deliberately NOT doing an unconditional recompute of every row.
-- `brand` was created NULL on every existing row two parts ago, so
-- setweight(to_tsvector('english', COALESCE(brand,'')), 'A') contributes an
-- empty tsvector and the recomputed value would be byte-identical to what is
-- already stored — a full table rewrite for zero change. Worse, products carries
-- an unconditional `set_products_updated_at BEFORE UPDATE FOR EACH ROW` trigger
-- (scripts/046_fix_product_persistence.sql), so a blanket UPDATE would bump
-- updated_at on every product in the catalogue as a side effect.
--
-- Rows that acquire a brand from here on are covered by the trigger above.
-- This backfill only repairs rows that never got a vector at all (e.g. inserted
-- before 20260225_search_trigram.sql), and is a no-op on a healthy database.
UPDATE public.products
SET search_vector = (
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
)
WHERE search_vector IS NULL;

-- The existing idx_products_search_vector GIN index needs no change.

-- ============================================================================
-- PART 6: GRANTS — RLS IS INTENTIONALLY UNTOUCHED
-- ============================================================================
-- No CREATE POLICY / DROP POLICY on public.products anywhere in this migration.
-- The existing policy set (scripts/040_add_product_archive_and_duplicate.sql and
-- scripts/015_fix_public_access_rls.sql) is load-bearing: "Published products are
-- viewable by everyone" carries an OR EXISTS(creators ...) clause that preserves
-- creator visibility of their own drafts, and a naive recreate would regress it.
--
-- Adding columns cannot break RLS — policies are row-level, not column-level,
-- and new columns inherit the existing table-level grant. Anonymous read of
-- published products is unaffected. The grant below is a defensive re-assert
-- only, matching 20260407_website_builder_public_read_hardened.sql.
GRANT SELECT ON public.products TO anon, authenticated;

-- ============================================================================
-- Rollback (manual, if ever needed):
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS size, DROP COLUMN IF EXISTS size_system,
--     DROP COLUMN IF EXISTS condition, DROP COLUMN IF EXISTS brand,
--     DROP COLUMN IF EXISTS color;
--   -- then restore update_product_search_vector() and its trigger from
--   -- 20260225_search_trigram.sql (dropping brand also drops it from the
--   -- trigger's UPDATE OF list automatically).
-- ============================================================================

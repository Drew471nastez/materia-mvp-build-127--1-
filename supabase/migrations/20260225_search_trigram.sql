-- ============================================================================
-- Trigram Search Indexes — 2026-02-25
-- Enables fast fuzzy/substring search using pg_trgm instead of sequential ILIKE.
-- Typical speedup: 10-50x for ILIKE '%term%' queries on large tables.
-- ============================================================================

-- Enable the pg_trgm extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Products — title search ─────────────────────────────────────────────────
-- GIN trigram index on title for fast ILIKE '%term%' pattern matching.
-- Only index published products since that's all the explore page queries.
CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON public.products USING GIN (title gin_trgm_ops)
  WHERE status = 'published';

-- ── Products — description search ───────────────────────────────────────────
-- GIN trigram index on description for ILIKE search fallback.
CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products USING GIN (description gin_trgm_ops)
  WHERE status = 'published';

-- ── Creators — slug search ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_creators_slug_trgm
  ON public.creators USING GIN (slug gin_trgm_ops)
  WHERE slug IS NOT NULL;

-- ── Profiles — username search ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING GIN (username gin_trgm_ops)
  WHERE username IS NOT NULL;

-- ── Profiles — display_name search ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING GIN (display_name gin_trgm_ops)
  WHERE display_name IS NOT NULL;

-- ============================================================================
-- Optional: Full-Text Search (FTS) column + index
-- Adds a tsvector column for weighted full-text search ranking.
-- This gives relevance-ranked results (unlike ILIKE which only does substring match).
-- ============================================================================

-- Add tsvector column to products (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE public.products ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Populate the search vector (title weighted A, description weighted B)
UPDATE public.products
SET search_vector = (
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
)
WHERE search_vector IS NULL;

-- GIN index on the tsvector for fast full-text search
CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON public.products USING GIN (search_vector)
  WHERE status = 'published';

-- Trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.update_product_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_search_vector ON public.products;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF title, description ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_search_vector();

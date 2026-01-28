-- ============================================
-- PRODUCT SLUG HISTORY - SHOPIFY-STYLE URL STABILITY
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times
--
-- PROBLEM: When product title changes, slug changes, old URLs break (404)
-- SOLUTION: Store slug history, old slugs redirect to current slug
--
-- Flow:
-- 1. Try finding product by products.slug (current)
-- 2. If not found → check product_slug_history
-- 3. If found via history → 301 redirect to /p/[currentSlug]
-- 4. Old URLs always work, no 404s
-- ============================================

-- ============================================
-- 1. CREATE PRODUCT_SLUG_HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_slug_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each old slug must be unique per creator (same as products.slug constraint)
  -- We store creator_id for efficient lookups
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_slug_history_slug ON public.product_slug_history(old_slug);
CREATE INDEX IF NOT EXISTS idx_product_slug_history_product ON public.product_slug_history(product_id);
CREATE INDEX IF NOT EXISTS idx_product_slug_history_creator_slug ON public.product_slug_history(creator_id, old_slug);

-- Unique constraint: each old_slug can only exist once per creator
-- This prevents conflicts when looking up by slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_slug_history_per_creator'
  ) THEN
    ALTER TABLE public.product_slug_history
    ADD CONSTRAINT unique_slug_history_per_creator UNIQUE (creator_id, old_slug);
  END IF;
END $$;

-- ============================================
-- 2. ENABLE RLS ON SLUG HISTORY TABLE
-- ============================================

ALTER TABLE public.product_slug_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS POLICIES FOR SLUG HISTORY
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view slug history" ON public.product_slug_history;
DROP POLICY IF EXISTS "Creators can manage their slug history" ON public.product_slug_history;
DROP POLICY IF EXISTS "slug_history_select_anon" ON public.product_slug_history;
DROP POLICY IF EXISTS "slug_history_select_auth" ON public.product_slug_history;
DROP POLICY IF EXISTS "slug_history_insert_auth" ON public.product_slug_history;

-- Anyone can view slug history (needed for redirects to work)
CREATE POLICY "Anyone can view slug history"
  ON public.product_slug_history FOR SELECT
  USING (true);

-- Only creators can insert/delete their own slug history
CREATE POLICY "Creators can manage their slug history"
  ON public.product_slug_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = product_slug_history.creator_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.product_slug_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_slug_history TO authenticated;
GRANT ALL ON public.product_slug_history TO service_role;

-- ============================================
-- 5. CREATE FUNCTION TO FIND PRODUCT BY SLUG (INCLUDING HISTORY)
-- ============================================
-- This function checks current slug first, then history
-- Returns product_id and redirect_to_slug if found via history

CREATE OR REPLACE FUNCTION public.find_product_by_slug(
  p_slug TEXT,
  p_status TEXT DEFAULT 'published'
)
RETURNS TABLE (
  product_id UUID,
  current_slug TEXT,
  needs_redirect BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First, try to find by current slug
  RETURN QUERY
  SELECT
    p.id as product_id,
    p.slug as current_slug,
    false as needs_redirect
  FROM public.products p
  WHERE p.slug = p_slug
  AND (p_status IS NULL OR p.status = p_status)
  LIMIT 1;

  -- If found, we're done
  IF FOUND THEN
    RETURN;
  END IF;

  -- Not found by current slug, check history
  RETURN QUERY
  SELECT
    p.id as product_id,
    p.slug as current_slug,
    true as needs_redirect
  FROM public.product_slug_history h
  JOIN public.products p ON p.id = h.product_id
  WHERE h.old_slug = p_slug
  AND (p_status IS NULL OR p.status = p_status)
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.find_product_by_slug TO anon;
GRANT EXECUTE ON FUNCTION public.find_product_by_slug TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_product_by_slug TO service_role;

-- ============================================
-- 6. CREATE TRIGGER TO AUTO-SAVE SLUG HISTORY ON UPDATE
-- ============================================
-- When a product's slug changes, automatically save the old slug to history

CREATE OR REPLACE FUNCTION public.save_product_slug_to_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if slug actually changed and old slug is not null/empty
  IF OLD.slug IS NOT NULL
     AND OLD.slug != ''
     AND OLD.slug IS DISTINCT FROM NEW.slug
  THEN
    -- Insert old slug into history (ignore if already exists)
    INSERT INTO public.product_slug_history (product_id, old_slug, creator_id)
    VALUES (OLD.id, OLD.slug, OLD.creator_id)
    ON CONFLICT (creator_id, old_slug) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_save_slug_history ON public.products;

-- Create trigger that fires before update
CREATE TRIGGER trigger_save_slug_history
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.save_product_slug_to_history();

-- ============================================
-- 7. MIGRATE EXISTING SLUGS TO HISTORY (OPTIONAL)
-- ============================================
-- This is optional - only needed if you want to pre-populate history
-- with current slugs. Uncomment if needed.

-- INSERT INTO public.product_slug_history (product_id, old_slug, creator_id)
-- SELECT id, slug, creator_id FROM public.products
-- WHERE slug IS NOT NULL AND slug != ''
-- ON CONFLICT (creator_id, old_slug) DO NOTHING;

-- ============================================
-- 8. ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.product_slug_history IS
  'Stores old product slugs for URL stability. When product title changes, old URLs still work via 301 redirect.';

COMMENT ON COLUMN public.product_slug_history.old_slug IS
  'The previous slug that should redirect to the current product slug';

COMMENT ON FUNCTION public.find_product_by_slug IS
  'Finds a product by slug, checking both current slug and history. Returns needs_redirect=true if found via history.';

COMMENT ON FUNCTION public.save_product_slug_to_history IS
  'Trigger function that automatically saves old slug to history when product slug changes.';

-- ============================================
-- DONE! Slug history system is ready.
-- ============================================
--
-- How it works:
-- 1. When you update a product and the slug changes, the old slug is
--    automatically saved to product_slug_history via trigger
-- 2. When someone visits /p/[old-slug], the page checks history
-- 3. If found in history, it 301 redirects to /p/[current-slug]
-- 4. Old URLs never break, SEO is preserved
--
-- The application code needs to:
-- 1. Call find_product_by_slug() or check history table
-- 2. If needs_redirect=true, do a 301 redirect to current_slug
-- ============================================

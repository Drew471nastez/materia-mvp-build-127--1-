-- ============================================
-- COMPLETE PRODUCT DATA FIX
-- ============================================
-- Run this ENTIRE script in your Supabase SQL Editor
-- This is a complete fix for product persistence and variants
-- Safe to run multiple times (idempotent)
-- ============================================

-- ============================================
-- PART 1: PRODUCTS TABLE - ADD ALL MISSING COLUMNS
-- ============================================

-- Add category column
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN category TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add FAQs column (JSONB)
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN faqs JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add What's Included column (text array)
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN whats_included TEXT[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add show_sales_badge
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN show_sales_badge BOOLEAN DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add gallery_urls
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN gallery_urls TEXT[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add video_url
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN video_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add video_urls array
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN video_urls TEXT[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add SEO columns
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN seo_title TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN seo_description TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add call_to_action
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN call_to_action TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add compare_at_cents
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN compare_at_cents INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add refund policy columns
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN refund_policy_enabled BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN refund_policy_type TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add sales tracking columns
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN sales_limit INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN sales_count INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add updated_at
DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- PART 2: CREATE PRODUCT_VARIANTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  additional_price_cents INTEGER DEFAULT 0,
  max_purchases INTEGER,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- ============================================
-- PART 3: CREATE PRODUCT_VARIANT_FILES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_variant_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  digital_asset_id UUID NOT NULL REFERENCES public.digital_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, digital_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant ON public.product_variant_files(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_files_asset ON public.product_variant_files(digital_asset_id);

-- ============================================
-- PART 4: CREATE PRODUCT_SLUG_HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_slug_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_slug_history_slug ON public.product_slug_history(old_slug);
CREATE INDEX IF NOT EXISTS idx_product_slug_history_product ON public.product_slug_history(product_id);

-- Add unique constraint if not exists
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
-- PART 5: ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_slug_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 6: RLS POLICIES FOR PRODUCT_VARIANTS
-- ============================================

-- Drop ALL existing policies first
DROP POLICY IF EXISTS "Anyone can view published product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their product variants" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_select_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_insert_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_update_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_delete_policy" ON public.product_variants;
DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated can manage variants" ON public.product_variants;

-- PUBLIC SELECT: Anyone can view variants for published products
CREATE POLICY "Public can view variants"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
      AND p.status = 'published'
    )
  );

-- AUTHENTICATED: Creators can do everything with their own product variants
CREATE POLICY "Authenticated can manage variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
      AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- PART 7: RLS POLICIES FOR PRODUCT_VARIANT_FILES
-- ============================================

DROP POLICY IF EXISTS "Anyone can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_select_policy" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_all_policy" ON public.product_variant_files;
DROP POLICY IF EXISTS "Public can view variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Authenticated can manage variant files" ON public.product_variant_files;

-- PUBLIC SELECT
CREATE POLICY "Public can view variant files"
  ON public.product_variant_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variant_files.variant_id
      AND p.status = 'published'
    )
  );

-- AUTHENTICATED: Full access for creators
CREATE POLICY "Authenticated can manage variant files"
  ON public.product_variant_files FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
      AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- PART 8: RLS POLICIES FOR PRODUCT_SLUG_HISTORY
-- ============================================

DROP POLICY IF EXISTS "Anyone can view slug history" ON public.product_slug_history;
DROP POLICY IF EXISTS "Creators can manage their slug history" ON public.product_slug_history;
DROP POLICY IF EXISTS "Public can view slug history" ON public.product_slug_history;
DROP POLICY IF EXISTS "Authenticated can manage slug history" ON public.product_slug_history;

-- Anyone can view (needed for redirects)
CREATE POLICY "Public can view slug history"
  ON public.product_slug_history FOR SELECT
  USING (true);

-- Creators can manage their own
CREATE POLICY "Authenticated can manage slug history"
  ON public.product_slug_history FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = product_slug_history.creator_id
      AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = product_slug_history.creator_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================

-- product_variants
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- product_variant_files
GRANT SELECT ON public.product_variant_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_files TO authenticated;
GRANT ALL ON public.product_variant_files TO service_role;

-- product_slug_history
GRANT SELECT ON public.product_slug_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_slug_history TO authenticated;
GRANT ALL ON public.product_slug_history TO service_role;

-- ============================================
-- PART 10: CREATE TRIGGERS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Products updated_at trigger
DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Product variants updated_at trigger
DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Slug history trigger function
CREATE OR REPLACE FUNCTION public.save_product_slug_to_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.slug IS NOT NULL
     AND OLD.slug != ''
     AND OLD.slug IS DISTINCT FROM NEW.slug
  THEN
    INSERT INTO public.product_slug_history (product_id, old_slug, creator_id)
    VALUES (OLD.id, OLD.slug, OLD.creator_id)
    ON CONFLICT (creator_id, old_slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Slug history trigger
DROP TRIGGER IF EXISTS trigger_save_slug_history ON public.products;
CREATE TRIGGER trigger_save_slug_history
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.save_product_slug_to_history();

-- ============================================
-- PART 11: VERIFY AND FIX PRODUCTS TABLE RLS
-- ============================================

-- Make sure products table has proper RLS policies
DROP POLICY IF EXISTS "Published products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Creators can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Creators can update their own products" ON public.products;
DROP POLICY IF EXISTS "Creators can delete their own products" ON public.products;

-- Recreate with proper policies
CREATE POLICY "Published products are viewable by everyone"
  ON public.products FOR SELECT
  USING (
    status = 'published'
    OR EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = products.creator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can insert their own products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = creator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can update their own products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = creator_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = creator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can delete their own products"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = creator_id AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- DONE! All product tables are now configured
-- ============================================
--
-- After running this:
-- 1. All product columns exist (category, faqs, whats_included, etc.)
-- 2. product_variants table exists with proper RLS
-- 3. product_variant_files table exists with proper RLS
-- 4. product_slug_history table exists for URL stability
-- 5. All triggers are in place for auto-updates
--
-- Test by:
-- 1. Go to Edit Product
-- 2. Add FAQs, What's Included, Variants, Category
-- 3. Click Save
-- 4. Refresh page - all data should persist
-- 5. Visit live product page - variants should display
-- ============================================

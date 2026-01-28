-- ============================================
-- FIX PRODUCT DATA PERSISTENCE
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times
--
-- This migration ensures all product columns exist and have proper types
-- for saving FAQs, What's Included, Variants, Media, Category, SEO, etc.

-- ============================================
-- 1. ADD MISSING COLUMNS TO PRODUCTS TABLE
-- ============================================

-- Add category column (direct category name, not junction table)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;

-- Add FAQs column (JSONB array of {question, answer} objects)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;

-- Add What's Included column (text array)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whats_included TEXT[] DEFAULT ARRAY['Instant download access', 'All included files', 'Lifetime access'];

-- Add sales badge toggle
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_sales_badge BOOLEAN DEFAULT true;

-- Add media columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';

-- Add SEO columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Add call to action column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS call_to_action TEXT;

-- Add compare at price column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER;

-- Add refund policy columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_fine_print TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_updated_at TIMESTAMPTZ;

-- Add limit sales columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_limit INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

-- Add timestamps if missing
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 2. CREATE PRODUCT_VARIANTS TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  additional_price_cents INTEGER DEFAULT 0,
  max_purchases INTEGER, -- NULL = unlimited
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- ============================================
-- 3. CREATE PRODUCT_VARIANT_FILES TABLE IF NOT EXISTS
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
-- 4. ENABLE RLS ON VARIANT TABLES
-- ============================================

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. DROP AND RECREATE RLS POLICIES FOR PRODUCT_VARIANTS
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view published product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their product variants" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_select_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_insert_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_update_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_delete_policy" ON public.product_variants;

-- Allow anyone to view variants for published products (or creators viewing their own)
CREATE POLICY "Anyone can view published product variants"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
      AND (
        p.status = 'published'
        OR EXISTS (
          SELECT 1 FROM public.creators c
          WHERE c.id = p.creator_id AND c.user_id = auth.uid()
        )
      )
    )
  );

-- Creators can insert/update/delete their own product variants
CREATE POLICY "Creators can manage their product variants"
  ON public.product_variants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. DROP AND RECREATE RLS POLICIES FOR PRODUCT_VARIANT_FILES
-- ============================================

DROP POLICY IF EXISTS "Anyone can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_select_policy" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_all_policy" ON public.product_variant_files;

-- Allow anyone to view variant files for published products
CREATE POLICY "Anyone can view variant files for published products"
  ON public.product_variant_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variant_files.variant_id
      AND (
        p.status = 'published'
        OR EXISTS (
          SELECT 1 FROM public.creators c
          WHERE c.id = p.creator_id AND c.user_id = auth.uid()
        )
      )
    )
  );

-- Creators can manage their own variant files
CREATE POLICY "Creators can manage their variant files"
  ON public.product_variant_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

-- Grant access to product_variants table
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- Grant access to product_variant_files table
GRANT SELECT ON public.product_variant_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_files TO authenticated;
GRANT ALL ON public.product_variant_files TO service_role;

-- ============================================
-- 8. CREATE TRIGGER FOR UPDATED_AT
-- ============================================

-- Create function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products updated_at
DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for product_variants updated_at
DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.products.faqs IS 'Array of FAQ objects: [{"question": "...", "answer": "..."}]';
COMMENT ON COLUMN public.products.whats_included IS 'Array of bullet points for what is included in the product';
COMMENT ON COLUMN public.products.category IS 'Direct category name (e.g., "Ebooks", "Templates", "Online Courses")';
COMMENT ON COLUMN public.products.gallery_urls IS 'Array of image URLs for product gallery';
COMMENT ON COLUMN public.products.video_url IS 'Single YouTube video URL';
COMMENT ON COLUMN public.products.seo_title IS 'SEO meta title for product page';
COMMENT ON COLUMN public.products.seo_description IS 'SEO meta description for product page';

-- ============================================
-- DONE! Product tables are now fully configured.
-- ============================================
--
-- After running this migration, all product data should save correctly:
-- - FAQs (JSONB array)
-- - What's Included (text array)
-- - Category (text)
-- - Gallery URLs (text array)
-- - Video URL (text)
-- - SEO Title & Description
-- - Variants (separate table with RLS)
-- ============================================

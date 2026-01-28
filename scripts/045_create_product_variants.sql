-- ============================================
-- CREATE PRODUCT VARIANTS
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times

-- ============================================
-- 1. CREATE PRODUCT_VARIANTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  description TEXT,
  additional_price_cents INTEGER DEFAULT 0,
  max_purchases INTEGER, -- NULL = unlimited
  position INTEGER DEFAULT 0, -- For ordering variants
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- ============================================
-- 2. CREATE PRODUCT_VARIANT_FILES TABLE
-- (Links variants to digital assets)
-- ============================================

CREATE TABLE IF NOT EXISTS public.product_variant_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  digital_asset_id UUID NOT NULL REFERENCES public.digital_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, digital_asset_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant ON public.product_variant_files(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_files_asset ON public.product_variant_files(digital_asset_id);

-- ============================================
-- 3. ENABLE RLS ON TABLES
-- ============================================

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. RLS POLICIES FOR PRODUCT_VARIANTS
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view published product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their product variants" ON public.product_variants;

-- Anyone can view variants for published products
CREATE POLICY "Anyone can view published product variants"
  ON public.product_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
    AND (p.status = 'published' OR EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = p.creator_id AND c.user_id = auth.uid()
    ))
  ));

-- Creators can manage their own product variants
CREATE POLICY "Creators can manage their product variants"
  ON public.product_variants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()
  ));

-- ============================================
-- 5. RLS POLICIES FOR PRODUCT_VARIANT_FILES
-- ============================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their variant files" ON public.product_variant_files;

-- Anyone can view variant files for published products
CREATE POLICY "Anyone can view variant files for published products"
  ON public.product_variant_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = product_variant_files.variant_id
    AND (p.status = 'published' OR EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = p.creator_id AND c.user_id = auth.uid()
    ))
  ));

-- Creators can manage their own variant files
CREATE POLICY "Creators can manage their variant files"
  ON public.product_variant_files FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE pv.id = product_variant_files.variant_id AND c.user_id = auth.uid()
  ));

-- ============================================
-- 6. GRANT PERMISSIONS
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
-- 7. CREATE UPDATED_AT TRIGGER
-- ============================================

-- Create function for updating timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for product_variants
DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DONE! Product variants tables are ready.
-- ============================================

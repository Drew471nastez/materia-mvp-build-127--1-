-- ============================================
-- ADD MISSING PRODUCT COLUMNS
-- ============================================
-- IMPORTANT: Run this SQL in your Supabase SQL Editor
-- This adds all columns needed for product data to save correctly
-- Safe to run multiple times
-- ============================================

-- Price comparison column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER;

-- Media columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gallery_urls TEXT[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_urls TEXT[];

-- Display settings
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_sales_badge BOOLEAN DEFAULT true;

-- Refund policy
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS refund_policy_type TEXT;

-- SEO fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Call to action
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS call_to_action TEXT;

-- What's included (array of text items)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whats_included TEXT[];

-- FAQs (JSONB array of {question, answer} objects)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;

-- Category
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;

-- Sales limits
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_limit INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

-- Updated at timestamp
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- CREATE PRODUCT_VARIANTS TABLE IF NOT EXISTS
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

-- Indexes for variants
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- Enable RLS on variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated can manage variants" ON public.product_variants;

-- Anyone can view variants for published products
CREATE POLICY "Public can view variants"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
      AND p.status = 'published'
    )
  );

-- Creators can manage their own variants
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

-- Grant permissions on variants
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- ============================================
-- CREATE PRODUCT_VARIANT_FILES TABLE IF NOT EXISTS
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

-- Enable RLS
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public can view variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Authenticated can manage variant files" ON public.product_variant_files;

-- Anyone can view variant files for published products
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

-- Creators can manage their own variant files
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

-- Grant permissions
GRANT SELECT ON public.product_variant_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_files TO authenticated;
GRANT ALL ON public.product_variant_files TO service_role;

-- ============================================
-- UPDATE TRIGGER FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DONE!
-- ============================================
-- After running this:
-- 1. All product columns will exist
-- 2. Product variants table will exist
-- 3. Data will save correctly
-- ============================================

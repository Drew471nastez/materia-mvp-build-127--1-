-- ============================================
-- COMPLETE PRODUCT FEATURES MIGRATION
-- ============================================
-- This script ensures all product-related tables and columns exist
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
--
-- Features covered:
-- 1. Product columns (description, SEO, FAQs, etc.)
-- 2. Product variants table with all columns
-- 3. Product variant files junction table
-- 4. FAQ order persistence
-- 5. RLS policies for all tables
-- ============================================

-- ============================================
-- PART 1: PRODUCTS TABLE - ADD MISSING COLUMNS
-- ============================================

-- Price comparison
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

-- FAQs (JSONB array of {question, answer, position} objects)
-- Position field allows custom ordering
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;

-- Category
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;

-- Sales limits
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_limit INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

-- Timestamps
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- PART 2: PRODUCT_VARIANTS TABLE
-- ============================================

-- Create the variants table if it doesn't exist
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

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  -- Check and add name column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'name') THEN
    ALTER TABLE public.product_variants ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled';
  END IF;

  -- Check and add description column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'description') THEN
    ALTER TABLE public.product_variants ADD COLUMN description TEXT;
  END IF;

  -- Check and add additional_price_cents column (THE CRITICAL ONE!)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'additional_price_cents') THEN
    ALTER TABLE public.product_variants ADD COLUMN additional_price_cents INTEGER DEFAULT 0;
  END IF;

  -- Check and add max_purchases column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'max_purchases') THEN
    ALTER TABLE public.product_variants ADD COLUMN max_purchases INTEGER;
  END IF;

  -- Check and add position column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'position') THEN
    ALTER TABLE public.product_variants ADD COLUMN position INTEGER DEFAULT 0;
  END IF;

  -- Check and add timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'created_at') THEN
    ALTER TABLE public.product_variants ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'updated_at') THEN
    ALTER TABLE public.product_variants ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for variants (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- Enable RLS on variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for variants
DROP POLICY IF EXISTS "Public can view variants for published products" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their own variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated can manage variants" ON public.product_variants;

-- Anyone can view variants for published products
CREATE POLICY "Public can view variants for published products"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
      AND p.status = 'published'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = product_variants.product_id
      AND c.user_id = auth.uid()
    )
  );

-- Creators can manage their own variants
CREATE POLICY "Creators can manage their own variants"
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
-- PART 3: PRODUCT_VARIANT_FILES TABLE
-- ============================================

-- Create the variant files junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.product_variant_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  digital_asset_id UUID NOT NULL REFERENCES public.digital_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, digital_asset_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant ON public.product_variant_files(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_files_asset ON public.product_variant_files(digital_asset_id);

-- Enable RLS
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- Drop and recreate RLS policies for variant files
DROP POLICY IF EXISTS "Public can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their own variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Public can view variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Authenticated can manage variant files" ON public.product_variant_files;

-- Anyone can view variant files for published products
CREATE POLICY "Public can view variant files for published products"
  ON public.product_variant_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = product_variant_files.variant_id
      AND p.status = 'published'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON p.creator_id = c.id
      WHERE pv.id = product_variant_files.variant_id
      AND c.user_id = auth.uid()
    )
  );

-- Creators can manage their own variant files
CREATE POLICY "Creators can manage their own variant files"
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
-- PART 4: UPDATED_AT TRIGGER
-- ============================================

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to products table
DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger to product_variants table
DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PART 5: REFRESH SCHEMA CACHE
-- ============================================

-- Notify PostgREST to reload schema (important for schema cache!)
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERIES (optional - run to verify)
-- ============================================

-- Verify products columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'products' ORDER BY ordinal_position;

-- Verify product_variants columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'product_variants' ORDER BY ordinal_position;

-- Verify RLS policies
-- SELECT schemaname, tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('products', 'product_variants', 'product_variant_files');

-- ============================================
-- DONE!
-- ============================================
-- After running this migration:
-- 1. All product columns will exist
-- 2. Product variants table will be fully configured
-- 3. Variant files junction table will be set up
-- 4. RLS policies will allow proper access
-- 5. Schema cache will be refreshed
--
-- If you still see schema cache errors after running this,
-- try restarting your Supabase project or waiting a few minutes.
-- ============================================

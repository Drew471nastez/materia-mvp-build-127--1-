-- ============================================
-- FIX VARIANT DELETION AND FILE ASSIGNMENT
-- ============================================
-- This migration ensures variant deletion works correctly.
-- Fixes foreign key constraints from entitlements and orders tables.
-- ============================================

-- Step 1: Ensure product_variant_files table exists
CREATE TABLE IF NOT EXISTS public.product_variant_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  digital_asset_id UUID NOT NULL REFERENCES public.digital_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(variant_id, digital_asset_id)
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant ON public.product_variant_files(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_files_asset ON public.product_variant_files(digital_asset_id);

-- Step 3: Enable RLS on tables
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FIX ENTITLEMENTS FOREIGN KEY CONSTRAINT
-- ============================================
DO $$
BEGIN
  ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_variant_id_fkey;
  ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS fk_entitlements_variant;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entitlements' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE public.entitlements ADD COLUMN variant_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.entitlements
    ADD CONSTRAINT entitlements_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- FIX ORDERS FOREIGN KEY CONSTRAINT
-- ============================================
DO $$
BEGIN
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_variant_id_fkey;
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_variant;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN variant_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- PRODUCT_VARIANTS RLS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Anyone can view variants for published products" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their own variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated can manage variants" ON public.product_variants;

CREATE POLICY "Anyone can view variants for published products"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.status = 'published')
    OR
    EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Creators can manage their own variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()));

-- ============================================
-- PRODUCT_VARIANT_FILES RLS POLICIES
-- ============================================
DROP POLICY IF EXISTS "Public can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their own variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Public can view variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Authenticated can manage variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Anyone can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_select_policy" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_all_policy" ON public.product_variant_files;

CREATE POLICY "Public can view variant files for published products"
  ON public.product_variant_files FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variant_files.variant_id AND p.status = 'published')
    OR
    EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Creators can manage their own variant files"
  ON public.product_variant_files FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = auth.uid()));

-- ============================================
-- ENTITLEMENTS & ORDERS UPDATE POLICIES
-- ============================================
DROP POLICY IF EXISTS "Creators can update their entitlements" ON public.entitlements;
CREATE POLICY "Creators can update their entitlements"
  ON public.entitlements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = entitlements.product_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = entitlements.product_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Creators can update their orders" ON public.orders;
CREATE POLICY "Creators can update their orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = orders.product_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = orders.product_id AND c.user_id = auth.uid()));

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

GRANT SELECT ON public.product_variant_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_files TO authenticated;
GRANT ALL ON public.product_variant_files TO service_role;

GRANT UPDATE ON public.entitlements TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';

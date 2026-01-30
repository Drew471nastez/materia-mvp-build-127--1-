-- ============================================
-- FIX VARIANT FILE ASSIGNMENT
-- ============================================
-- This migration ensures variant file assignments work correctly.
-- Run this if you're having issues assigning files to variants.
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

-- Step 3: Enable RLS
ALTER TABLE public.product_variant_files ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop and recreate RLS policies
DROP POLICY IF EXISTS "Public can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their own variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Public can view variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Authenticated can manage variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Anyone can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_select_policy" ON public.product_variant_files;
DROP POLICY IF EXISTS "product_variant_files_all_policy" ON public.product_variant_files;

-- Policy 1: Anyone can view variant files for published products OR their own
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

-- Policy 2: Creators can manage (INSERT, UPDATE, DELETE) their own variant files
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

-- Step 5: Grant permissions
GRANT SELECT ON public.product_variant_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_files TO authenticated;
GRANT ALL ON public.product_variant_files TO service_role;

-- Step 6: Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify the migration worked:
--
-- SELECT tablename, policyname
-- FROM pg_policies
-- WHERE tablename = 'product_variant_files';
--
-- SELECT has_table_privilege('authenticated', 'product_variant_files', 'DELETE');
-- ============================================

-- ============================================
-- DONE!
-- ============================================
-- After running this:
-- 1. product_variant_files table exists with correct schema
-- 2. RLS policies allow creators to manage their variant files
-- 3. DELETE permission is granted to authenticated users
-- ============================================

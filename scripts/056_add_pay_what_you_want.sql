-- ============================================
-- Pay What You Want Feature Migration
-- ============================================
-- This migration adds support for "Pay What You Want" pricing
-- at both the product level and variant level.
--
-- Run this in Supabase SQL Editor.
-- ============================================

-- Add Pay What You Want columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pay_what_you_want BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pwyw_min_price_cents INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pwyw_suggested_price_cents INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.products.pay_what_you_want IS
'When enabled, buyers can name their own price above the minimum';

COMMENT ON COLUMN public.products.pwyw_min_price_cents IS
'Minimum price in cents for pay-what-you-want. 0 means free allowed, NULL uses product price_cents';

COMMENT ON COLUMN public.products.pwyw_suggested_price_cents IS
'Suggested/default price shown in the input for pay-what-you-want';

-- Add Pay What You Want columns to product_variants table
ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS pay_what_you_want BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pwyw_min_price_cents INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pwyw_suggested_price_cents INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.product_variants.pay_what_you_want IS
'When enabled, buyers can name their own price for this variant above the minimum';

COMMENT ON COLUMN public.product_variants.pwyw_min_price_cents IS
'Minimum price in cents for pay-what-you-want on this variant. 0 means free allowed';

COMMENT ON COLUMN public.product_variants.pwyw_suggested_price_cents IS
'Suggested/default price shown in the input for pay-what-you-want on this variant';

-- ============================================
-- Add variant_id to entitlements for per-variant access control
-- ============================================
-- This allows users to purchase different variants of the same product separately

-- Add variant_id column
ALTER TABLE public.entitlements
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.entitlements.variant_id IS
'The specific variant purchased. NULL means access to product without a specific variant.';

-- Create index for efficient variant lookup
CREATE INDEX IF NOT EXISTS idx_entitlements_variant ON public.entitlements(variant_id);

-- Drop the old unique constraint (buyer_id, product_id) if it exists
-- and create a new one that includes variant_id
DO $$
BEGIN
  -- Try to drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_buyer_product'
    AND conrelid = 'public.entitlements'::regclass
  ) THEN
    ALTER TABLE public.entitlements DROP CONSTRAINT unique_buyer_product;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Constraint doesn't exist, that's fine
    NULL;
END $$;

-- Create new unique constraint that includes variant_id
-- This uses COALESCE to handle NULL variant_id correctly
-- We use a unique index instead of constraint for better NULL handling
DROP INDEX IF EXISTS idx_entitlements_unique_buyer_product_variant;
CREATE UNIQUE INDEX idx_entitlements_unique_buyer_product_variant
ON public.entitlements (buyer_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Verification queries (optional - run to verify)
-- ============================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'products'
-- AND column_name IN ('pay_what_you_want', 'pwyw_min_price_cents', 'pwyw_suggested_price_cents');

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'product_variants'
-- AND column_name IN ('pay_what_you_want', 'pwyw_min_price_cents', 'pwyw_suggested_price_cents');

-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'entitlements'
-- AND column_name = 'variant_id';

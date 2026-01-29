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

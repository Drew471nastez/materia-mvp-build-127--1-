-- ============================================
-- ADD COMPARE AT PRICE FOR VARIANTS
-- ============================================
-- This migration adds a compare_at_price_cents field to product_variants
-- for showing crossed-out original prices (sale pricing)
-- ============================================

-- Step 1: Add the compare_at_price_cents column
ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS compare_at_price_cents INTEGER DEFAULT NULL;

-- Step 2: Add a comment explaining the column
COMMENT ON COLUMN public.product_variants.compare_at_price_cents IS
'Original price shown crossed out when displaying sale/discount pricing. NULL means no compare-at price.';

-- Step 3: Refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify the migration worked:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name = 'product_variants'
-- ORDER BY ordinal_position;

-- ============================================
-- DONE!
-- ============================================

-- ============================================
-- VARIANT PRICING MIGRATION
-- ============================================
-- This migration changes variant pricing from "additional price"
-- to "final price" model.
--
-- OLD MODEL: variant price = base_price + additional_price_cents
-- NEW MODEL: variant price = price_cents (final price)
--
-- IMPORTANT: Run this AFTER running 050_complete_product_features.sql
-- ============================================

-- Step 1: Rename additional_price_cents to price_cents
-- This is a simple rename, no data transformation needed

DO $$
BEGIN
  -- Check if the old column exists and new column doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'product_variants'
    AND column_name = 'additional_price_cents'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'product_variants'
    AND column_name = 'price_cents'
  ) THEN
    -- Rename the column
    ALTER TABLE public.product_variants
    RENAME COLUMN additional_price_cents TO price_cents;

    RAISE NOTICE 'Renamed additional_price_cents to price_cents';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'product_variants'
    AND column_name = 'price_cents'
  ) THEN
    RAISE NOTICE 'Column price_cents already exists, skipping rename';
  ELSE
    -- Neither column exists, create price_cents
    ALTER TABLE public.product_variants
    ADD COLUMN IF NOT EXISTS price_cents INTEGER DEFAULT 0;

    RAISE NOTICE 'Created new price_cents column';
  END IF;
END $$;

-- Step 2: Ensure price_cents has a default value
ALTER TABLE public.product_variants
ALTER COLUMN price_cents SET DEFAULT 0;

-- Step 3: Update any NULL values to 0
UPDATE public.product_variants
SET price_cents = 0
WHERE price_cents IS NULL;

-- Step 4: Refresh the schema cache
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
-- After running this:
-- 1. The column is now named 'price_cents'
-- 2. It represents the FINAL price for the variant
-- 3. Base product price is only used when NO variants exist
-- ============================================

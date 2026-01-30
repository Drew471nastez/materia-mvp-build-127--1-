-- ============================================
-- PUBLISH TO MARKETPLACE MIGRATION
-- ============================================
-- This migration adds the publish_to_marketplace column to products table.
-- When TRUE, the product is listed on the public marketplace.
-- When FALSE, the product is only accessible via direct link.
-- Defaults to TRUE (recommended for visibility).
-- ============================================

-- Step 1: Add the publish_to_marketplace column
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS publish_to_marketplace BOOLEAN DEFAULT TRUE;

-- Step 2: Update any existing products to have marketplace visibility enabled
UPDATE public.products
SET publish_to_marketplace = TRUE
WHERE publish_to_marketplace IS NULL;

-- Step 3: Refresh the schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to verify the migration worked:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name = 'products'
-- AND column_name = 'publish_to_marketplace';

-- ============================================
-- DONE!
-- ============================================
-- After running this:
-- 1. Products table has publish_to_marketplace column
-- 2. Existing products default to TRUE (visible on marketplace)
-- 3. Sellers can toggle this off to hide from marketplace
-- ============================================

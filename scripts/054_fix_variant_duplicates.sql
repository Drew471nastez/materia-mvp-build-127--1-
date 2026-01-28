-- =====================================================
-- FIX VARIANT DUPLICATES
-- Run this in Supabase SQL Editor to clean up existing
-- duplicate variants and prevent future duplicates
-- =====================================================

-- Step 1: View current duplicates (informational - shows what will be cleaned)
-- Uncomment to check before running the cleanup:
/*
SELECT
  product_id,
  name,
  position,
  COUNT(*) as duplicate_count,
  array_agg(id) as variant_ids
FROM product_variants
GROUP BY product_id, name, position
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
*/

-- Step 2: Delete duplicate variant files first (keep only one per variant)
-- This deletes orphaned variant_files that reference soon-to-be-deleted variants
DELETE FROM product_variant_files
WHERE variant_id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, position
        ORDER BY created_at ASC  -- Keep the oldest (first created)
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

-- Step 3: Delete duplicate variants, keeping only the first one (by created_at) for each product+position
DELETE FROM product_variants
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, position
        ORDER BY created_at ASC  -- Keep the oldest (first created)
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

-- Step 4: Also clean up any variants with duplicate names within the same product
-- (in case position isn't the issue)
DELETE FROM product_variant_files
WHERE variant_id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, name
        ORDER BY created_at ASC
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

DELETE FROM product_variants
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, name
        ORDER BY created_at ASC
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

-- Step 5: Add unique constraint to prevent future duplicates
-- Drop existing constraint if it exists (safe to run multiple times)
ALTER TABLE product_variants
DROP CONSTRAINT IF EXISTS product_variants_product_position_unique;

-- Add unique constraint on product_id + position
-- This ensures no two variants for the same product can have the same position
ALTER TABLE product_variants
ADD CONSTRAINT product_variants_product_position_unique
UNIQUE (product_id, position);

-- Step 6: Verify cleanup worked
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT product_id, position, COUNT(*) as cnt
    FROM product_variants
    GROUP BY product_id, position
    HAVING COUNT(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE WARNING 'There are still % duplicate position entries', dup_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All variant duplicates have been cleaned up';
  END IF;
END $$;

-- Step 7: Show final state
SELECT
  p.title as product_title,
  pv.name as variant_name,
  pv.position,
  pv.price_cents,
  pv.created_at
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
ORDER BY p.title, pv.position;

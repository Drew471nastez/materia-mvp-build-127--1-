-- =====================================================
-- FIX VARIANT DUPLICATES - COMPLETE SOLUTION
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Remove the unique constraint that's causing save errors
ALTER TABLE product_variants
DROP CONSTRAINT IF EXISTS product_variants_product_position_unique;

-- Step 2: Delete duplicate variant files first
DELETE FROM product_variant_files
WHERE variant_id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, position
        ORDER BY created_at ASC
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

-- Step 3: Delete duplicate variants by position (keep oldest)
DELETE FROM product_variants
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, position
        ORDER BY created_at ASC
      ) as rn
    FROM product_variants
  ) sub
  WHERE rn > 1
);

-- Step 4: Also clean up duplicates by name within same product
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

-- Step 5: Show cleanup results
SELECT 'Cleanup complete!' as status;

SELECT
  p.title as product_title,
  COUNT(pv.id) as variant_count
FROM products p
LEFT JOIN product_variants pv ON pv.product_id = p.id
GROUP BY p.id, p.title
HAVING COUNT(pv.id) > 0
ORDER BY p.title;

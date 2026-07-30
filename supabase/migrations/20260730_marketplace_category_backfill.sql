-- ============================================================================
-- Marketplace Category Backfill — 2026-07-30
-- Companion to 20260730_marketplace_physical_attributes.sql, which adds columns
-- but deliberately re-categorises nothing.
--
-- Every consumer of the new taxonomy filters on strict equality against the ten
-- IDs in lib/marketplace/categories.ts (all, womenswear, menswear, sneakers,
-- bags-accessories, jewellery, beauty, books, home, vintage). Every existing row
-- still holds a pre-pivot digital category ('design', 'ai', 'Notion Templates',
-- …) or a display-name variant, so without this migration all nine category
-- pages, all nine category tiles and every category pill resolve to zero
-- listings — while the "All" feed looks perfectly healthy, which is exactly why
-- it is easy to ship.
--
-- The mapping below is the SQL twin of DB_CATEGORY_TO_ID + LEGACY_DIGITAL_TO_ID
-- + FALLBACK_CATEGORY_ID in lib/marketplace/categories.ts. The TypeScript side
-- still resolves at read time (a client on an old deploy can write a legacy
-- value at any moment), so the two must be kept in step — but after this runs
-- the resolver is a safety net rather than the thing holding the UI up.
--
-- Idempotent: every statement is scoped to rows that are not already on a valid
-- ID, so a second run updates zero rows.
-- ============================================================================

-- ============================================================================
-- PART 1: KNOWN VOCABULARY → TAXONOMY ID
-- ============================================================================
-- Matching is on lower(btrim(category)) so "Bags & Accessories", "bags &
-- accessories" and " Bags & Accessories " all collapse to the same key, mirroring
-- normalizeCategoryToId(). Source keys are the exact keys of DB_CATEGORY_TO_ID
-- and LEGACY_DIGITAL_TO_ID; anything absent here is handled by PART 2.
--
-- NOTE: products carries an unconditional `set_products_updated_at BEFORE UPDATE`
-- trigger (scripts/046_fix_product_persistence.sql), so re-categorised rows get a
-- fresh updated_at. That is intentional here — app/sitemap.ts reports
-- products.updated_at as lastModified, and the listing genuinely changed.
-- search_vector is untouched: its trigger is `UPDATE OF title, description, brand`,
-- and category is not part of the vector.

WITH category_mapping(source, target) AS (
  VALUES
    -- Physical vocabulary that may already be in use (display names, plurals, slang)
    ('women',              'womenswear'),
    ('womens',             'womenswear'),
    ('women''s',           'womenswear'),
    ('womens clothing',    'womenswear'),
    ('women''s clothing',  'womenswear'),
    ('ladies',             'womenswear'),
    ('dresses',            'womenswear'),
    ('clothing',           'womenswear'),
    ('fashion',            'womenswear'),
    ('men',                'menswear'),
    ('mens',               'menswear'),
    ('men''s',             'menswear'),
    ('mens clothing',      'menswear'),
    ('men''s clothing',    'menswear'),
    ('shoes',              'sneakers'),
    ('footwear',           'sneakers'),
    ('trainers',           'sneakers'),
    ('sneaker',            'sneakers'),
    ('kicks',              'sneakers'),
    ('bags',               'bags-accessories'),
    ('bags & accessories', 'bags-accessories'),
    ('bags and accessories', 'bags-accessories'),
    ('accessories',        'bags-accessories'),
    ('handbags',           'bags-accessories'),
    ('watches',            'bags-accessories'),
    ('jewelry',            'jewellery'),
    ('jewelery',           'jewellery'),
    ('makeup',             'beauty'),
    ('make-up',            'beauty'),
    ('cosmetics',          'beauty'),
    ('skincare',           'beauty'),
    ('fragrance',          'beauty'),
    ('perfume',            'beauty'),
    ('beauty & personal care', 'beauty'),
    ('book',               'books'),
    ('literature',         'books'),
    ('manga',              'books'),
    ('comics',             'books'),
    ('textbooks',          'books'),
    ('home & living',      'home'),
    ('home and living',    'home'),
    ('homeware',           'home'),
    ('homewares',          'home'),
    ('home decor',         'home'),
    ('decor',              'home'),
    ('interiors',          'home'),
    ('furniture',          'home'),
    ('kitchen',            'home'),
    ('retro',              'vintage'),
    ('y2k',                'vintage'),
    ('thrift',             'vintage'),
    ('second hand',        'vintage'),
    ('secondhand',         'vintage'),
    ('pre-loved',          'vintage'),
    ('preloved',           'vintage'),
    -- Pre-pivot digital taxonomy with a plausible physical analogue.
    -- Visual/printable goods → Home (which owns the "Art & Prints" subcategory).
    ('design',             'home'),
    ('graphics',           'home'),
    ('graphic design',     'home'),
    ('illustration',       'home'),
    ('illustrations',      'home'),
    ('photography',        'home'),
    ('photos',             'home'),
    ('video',              'home'),
    ('video & film',       'home'),
    ('film',               'home'),
    ('art',                'home'),
    -- Anything read rather than worn → Books.
    ('education',          'books'),
    ('courses',            'books'),
    ('course',             'books'),
    ('ebooks',             'books'),
    ('ebook',              'books'),
    ('writing',            'books'),
    ('writing & publishing', 'books'),
    ('notion templates',   'books')
)
UPDATE public.products AS p
SET category = m.target
FROM category_mapping AS m
WHERE lower(btrim(p.category)) = m.source
  AND p.category IS DISTINCT FROM m.target;

-- ============================================================================
-- PART 2: EVERYTHING ELSE → THE FALLBACK BUCKET
-- ============================================================================
-- Covers the remaining pre-pivot categories with no analogue at all
-- ('development', 'productivity', 'ai', 'business', 'marketing', 'social-media',
-- 'ecommerce', 'audio-music', 'freebies', 'other', …), free-text one-offs, and
-- NULL.
--
-- 'vintage' rather than 'other' or NULL: it is the taxonomy's genuine grab-bag,
-- so a mis-bucketed listing still reads as plausible to a shopper, and it is a
-- real category page rather than a hole. This matches FALLBACK_CATEGORY_ID in
-- lib/marketplace/categories.ts — change both together or the UI and the
-- database will disagree about where a legacy listing lives.
--
-- 'all' is excluded from the valid set on purpose: it is the feed, not a
-- category, so a row filed as 'all' is invisible on every category surface and
-- needs re-bucketing like any other stale value.

UPDATE public.products
SET category = 'vintage'
WHERE category IS NULL
   OR lower(btrim(category)) NOT IN (
        'womenswear', 'menswear', 'sneakers', 'bags-accessories',
        'jewellery', 'beauty', 'books', 'home', 'vintage'
      );

-- ============================================================================
-- PART 3: NORMALISE CASING / WHITESPACE ON ALREADY-VALID VALUES
-- ============================================================================
-- A row holding 'Vintage' or ' books ' resolves correctly in TypeScript (the
-- resolver lowercases and trims) but would be missed by a future server-side
-- `.in("category", …)` filter, which is case-sensitive. Cheap to fix now, while
-- the catalogue is small.

UPDATE public.products
SET category = lower(btrim(category))
WHERE category IS NOT NULL
  AND category <> lower(btrim(category))
  AND lower(btrim(category)) IN (
        'womenswear', 'menswear', 'sneakers', 'bags-accessories',
        'jewellery', 'beauty', 'books', 'home', 'vintage'
      );

-- ============================================================================
-- No CHECK constraint on products.category on purpose: sellers pick from the
-- taxonomy in the UI, and a constraint would turn the next taxonomy edit into a
-- lock-taking migration. resolveProductCategoryId() in
-- lib/marketplace/categories.ts is the read-side guarantee.
--
-- Rollback: there is none — the pre-pivot category values are not recoverable
-- from this migration. Snapshot `SELECT id, category FROM products` before
-- applying if that matters.
-- ============================================================================

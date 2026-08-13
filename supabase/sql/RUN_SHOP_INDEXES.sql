-- ###########################################################################
--  STORELIB — INDEXES FOR THE RESULTS PAGE (/shop)
-- ###########################################################################
--
--  Safe to run more than once. Every statement is IF NOT EXISTS, nothing is
--  dropped, no data is touched, and no column is added — this file only builds
--  indexes.
--
--  ---------------------------------------------------------------------------
--  WHY THIS FILE EXISTS
--  ---------------------------------------------------------------------------
--  /shop/women/shoes is a new query shape. Until now the marketplace only ever
--  asked for published listings in a category, newest first — which
--  20260730_marketplace_physical_attributes.sql already covers with
--  idx_products_published_category_created.
--
--  The results page adds three things that index does not serve:
--
--    SORT BY PRICE. "Preț crescător" orders by price_cents, and there is no
--    index on that column at all. Without one every sort by price reads every
--    published row in the category and sorts it in memory.
--
--    A PRICE RANGE. `min`/`max` are >= and <= on the same unindexed column.
--
--    SORT BY POPULARITY. Orders by sales_count, also unindexed.
--
--  And all three run alongside `count: exact`, which executes the same
--  predicate a second time — so an unindexed sort is paid for twice per page.
--
--  ---------------------------------------------------------------------------
--  WHY PARTIAL, AND WHY NOT ONE WIDE COMPOSITE
--  ---------------------------------------------------------------------------
--  Every index here is `WHERE status = 'published'`, which is the only status
--  this page ever asks for: the predicate keeps drafts, sold and hidden rows out
--  of the index entirely, so it is smaller than the table and never has to
--  filter after the scan. `status` is therefore absent from the key — a column
--  pinned to one value by the predicate carries no information in the key.
--
--  They follow the shape the existing file chose deliberately: one index per
--  access path rather than a single wide composite. Postgres can BitmapAnd
--  several of these for whatever combination of facets somebody has ticked,
--  while a composite only ever serves one prefix order — and this page has
--  seven facets in any combination and four sorts.
--
--  ---------------------------------------------------------------------------
--  WHAT IS DELIBERATELY NOT HERE
--  ---------------------------------------------------------------------------
--  · Brand. `idx_products_brand_trgm` (GIN, gin_trgm_ops) already serves the
--    case-insensitive ILIKE the brand filter runs. `idx_products_brand_lower`
--    would NOT: a `lower(brand)` expression index cannot answer `brand ILIKE
--    'Nike'`, because the planner does not rewrite one into the other.
--
--  · Size, condition, colour. Already indexed by the two earlier migrations —
--    idx_products_size, idx_products_condition_created, idx_products_colour.
--
--  · "La reducere". It is `compare_at_cents > price_cents`, a comparison
--    between two columns that PostgREST cannot express as a filter, so the
--    application applies it after the page is fetched. An index on it would
--    never be reached from this page. If that filter ever moves into SQL it
--    wants a partial index on the predicate itself, and the honest place to
--    write that is the migration that moves it.
-- ###########################################################################

-- ── SORT BY PRICE, INSIDE A CATEGORY ────────────────────────────────────────
-- The common case: a department or a group in the path, then Preț crescător /
-- descrescător. Both directions are served by one index — Postgres reads a
-- B-tree backwards at no cost, which is why there is no DESC twin.
CREATE INDEX IF NOT EXISTS idx_products_published_category_price
  ON public.products (category, price_cents)
  WHERE status = 'published';

-- ── SORT BY PRICE, AND PRICE RANGES, WITH NO CATEGORY ───────────────────────
-- /shop?q=nike&min=100, and /shop with a price band and no department. The
-- category index above cannot serve these: its leading column is not in the
-- predicate, so the scan would have to start at the wrong end of the tree.
CREATE INDEX IF NOT EXISTS idx_products_published_price
  ON public.products (price_cents)
  WHERE status = 'published';

-- ── SORT BY POPULARITY ──────────────────────────────────────────────────────
-- `created_at DESC` is the tie-break rather than decoration: sales_count is 0
-- for most of a young catalogue, so without it "Populare" returns an arbitrary
-- order among everything that has never sold — and an arbitrary order that
-- CHANGES between page 1 and page 2 shows the same listing twice and hides
-- another. A total order is what makes pagination correct.
CREATE INDEX IF NOT EXISTS idx_products_published_category_sales
  ON public.products (category, sales_count DESC, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_products_published_sales
  ON public.products (sales_count DESC, created_at DESC)
  WHERE status = 'published';

-- ── AND THE FACET QUERY ─────────────────────────────────────────────────────
-- The filter sheet's options are counted by a second, cheaper query: five
-- attribute columns across the whole category scope, capped at 1000 rows. This
-- covering index answers it from the index alone — no heap fetch for a query
-- that touches a thousand rows and displays none of them.
--
-- `category` leads because that is the scope; the rest are payload, which is
-- what INCLUDE is for: they are not searchable through this index and do not
-- widen the tree.
CREATE INDEX IF NOT EXISTS idx_products_published_facets
  ON public.products (category)
  INCLUDE (brand, size, colour, condition, price_cents, compare_at_cents)
  WHERE status = 'published';

-- ── A ROW AN OPERATOR CAN READ ──────────────────────────────────────────────
SELECT
  'shop indexes' AS section,
  count(*) FILTER (WHERE indexname = 'idx_products_published_category_price') AS category_price,
  count(*) FILTER (WHERE indexname = 'idx_products_published_price') AS price,
  count(*) FILTER (WHERE indexname = 'idx_products_published_category_sales') AS category_sales,
  count(*) FILTER (WHERE indexname = 'idx_products_published_sales') AS sales,
  count(*) FILTER (WHERE indexname = 'idx_products_published_facets') AS facets
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'products';

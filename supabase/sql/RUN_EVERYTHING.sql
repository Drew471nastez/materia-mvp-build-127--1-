-- ###########################################################################
--  STORELIB — RUN EVERYTHING
-- ###########################################################################
--  ONE file. Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  This is every migration and RUN_*.sql this marketplace needs, concatenated
--  in the only order they are safe in. Nothing is retyped — it is the real
--  files, read at build time, so this cannot drift from them. Regenerate with
--
--      node scripts/build-run-everything-sql.mjs
--
--  IDEMPOTENT. Running it a second time changes nothing and raises nothing.
--  Every statement in it guards itself (create if not exists / drop policy if
--  exists / add column if not exists), so it is safe whether you have none of
--  this, some of it, or all of it already. Run it if you are not sure.
--
--  NO PREREQUISITES beyond the base schema (public.products, public.profiles,
--  public.orders, public.wishlist_items). Sections that reference a table this
--  database does not have degrade to a NOTICE instead of aborting the rest.
--
--  ORDER, and why:
--     1. Listing attributes: size, condition, brand, colour
--     2. Subcategory, era, tags, drafts, the brand directory, the photo bucket
--     3. Search and wishlist indexes
--     4. Messaging, notifications, follows, safety
--     5. Profile bio and cover
--     6. Chat push
--     7. Likes, follows and trending push
--     8. Optimised image variants
--     9. One buyer at a time
--    10. Shipping and AWB
--    11. A profiles row for every account
--
-- ---------------------------------------------------------------------------
--  TWO THINGS ARE DELIBERATELY NOT IN HERE
-- ---------------------------------------------------------------------------
--  1. supabase/sql/RUN_CURRENCY_RON.sql — switches the catalogue from USD to
--     lei. It REWRITES EVERY PRICE and must be sequenced with an environment
--     variable: run the SQL FIRST, and only then set
--     NEXT_PUBLIC_PLATFORM_CURRENCY=ron in Vercel and redeploy. Doing it the
--     other way round sells a $100 listing for 100 lei. Run it on its own,
--     deliberately, once.
--
--  2. supabase/migrations/20260805_storelib_seed.sql — creates the official
--     Storelib account (a row in auth.users) and its thread in every inbox.
--     Optional, and it makes an ACCOUNT, so it stays a separate paste.
-- ###########################################################################




-- ###########################################################################
--  SECTION  1: Listing attributes: size, condition, brand, colour
--  source: supabase/migrations/20260730_marketplace_physical_attributes.sql
-- ###########################################################################

-- ============================================================================
-- Marketplace Physical Attributes — 2026-07-30
-- Storelib is pivoting from a digital-products marketplace into a Depop/Vinted
-- style marketplace for tangible, mostly second-hand goods (fashion, sneakers,
-- books, home, vintage). Resale listings are described by attributes the
-- digital schema never needed: what size it is, what condition it's in, what
-- brand made it and what colour it is.
--
-- This migration adds those five attributes to public.products, constrains the
-- two closed vocabularies, indexes them for feed filtering, and teaches the
-- full-text search vector about brand (on a resale marketplace the brand *is*
-- the query — "nike", "carhartt" — and it often never appears in the title).
--
-- Every statement is idempotent; this migration is safe to re-run.
-- Nothing here is destructive: no column is dropped, no row is rewritten and
-- no RLS policy is touched.
-- ============================================================================

-- pg_trgm is already enabled by 20260225_search_trigram.sql; re-asserted here
-- because the brand autocomplete index below depends on it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- PART 1: NEW COLUMNS
-- ============================================================================
-- All five are nullable with no default. A default would falsely mark every
-- existing digital row as having a condition, and would destroy the usefulness
-- of `WHERE condition IS NOT NULL` as a "is this a tangible listing" probe.
-- Nullable also means existing insert paths (the product form, duplicate_product,
-- the legacy edit form) keep working untouched.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size_system TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS color TEXT;

-- COMMENT ON COLUMN is inherently idempotent (it overwrites), so these sit
-- outside the guards and always reflect the current intent.
COMMENT ON COLUMN public.products.size IS
  'Display size label exactly as the seller entered it: M, 42, UK 9, One size, 30W 32L. NULL for items with no size (books, most home/vintage). Deliberately not normalised — see size_system for disambiguation.';

COMMENT ON COLUMN public.products.size_system IS
  'Disambiguates size: alpha, eu, uk, us, numeric, one-size. NULL when size is NULL or the system is unknown.';

COMMENT ON COLUMN public.products.condition IS
  'Second-hand condition ladder: new_with_tags, new_without_tags, very_good, good, satisfactory. NULL for digital products and unspecified listings.';

COMMENT ON COLUMN public.products.brand IS
  'Free-text seller-entered brand. No CHECK — brand vocabulary is open-ended and long-tail; normalisation belongs in a future brands lookup table. Feeds the search vector at weight A.';

COMMENT ON COLUMN public.products.color IS
  'Free-text primary colour. American spelling to match creators.brand_color and the rest of the codebase; UI labels may read "Colour".';

-- ============================================================================
-- PART 2: CHECK CONSTRAINTS ON THE CLOSED VOCABULARIES
-- ============================================================================
-- TEXT + CHECK rather than a Postgres enum, matching every other constrained
-- column in this schema (products.type, products.status, products.refund_policy_type,
-- coupons.discount_type). There are no enums anywhere in this database, and
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction that uses the new
-- value — which would make extending this taxonomy painful later.
--
-- ADD CONSTRAINT is not idempotent the way ADD COLUMN IF NOT EXISTS is, so each
-- is guarded on pg_constraint. Both forms spell out `IS NULL OR` even though a
-- bare IN would also pass NULLs, so the intent survives a future SET NOT NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_condition_check'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_condition_check
      CHECK (condition IS NULL OR condition IN (
        'new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_size_system_check'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_size_system_check
      CHECK (size_system IS NULL OR size_system IN (
        'alpha', 'eu', 'uk', 'us', 'numeric', 'one-size'
      ));
  END IF;
END $$;

-- ============================================================================
-- PART 3: ALLOW 'physical' AS A PRODUCT TYPE
-- ============================================================================
-- products.type is still CHECK (type IN ('digital','course','community')) from
-- scripts/003_create_products.sql. The pivot needs a fourth value so the seller
-- flow can list a tangible item. Widening it now avoids a second migration
-- round-trip later.
--
-- NO ROW IS MIGRATED and no code path writes 'physical' yet — the product form
-- state is still typed "digital" | "course", and product-card.tsx / the product
-- detail page branch on type in ways that would render a physical item wrongly.
-- This is schema-forward only.
--
-- The swap only runs when the existing constraint is found, which is exactly
-- the case where it is provably safe: every row already satisfies the narrower
-- three-value check, so the widened four-value check cannot fail validation.
-- Skipped entirely once 'physical' is already allowed, so re-running costs
-- nothing (no repeat full-table validation scan).
-- 'physical' is the established spelling — scripts/024_create_categories.sql
-- already uses it on the separate categories table.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_type_check'
    AND conrelid = 'public.products'::regclass
    AND pg_get_constraintdef(oid) NOT LIKE '%physical%'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_type_check;

    ALTER TABLE public.products
      ADD CONSTRAINT products_type_check
      CHECK (type IN ('digital', 'course', 'community', 'physical'));
  END IF;
END $$;

-- ============================================================================
-- PART 4: FEED + FACET INDEXES
-- ============================================================================
-- No CONCURRENTLY: this migration runs inside a transaction.

-- The highest-value index here, and one that is currently missing: the only
-- published-products index today is (status, created_at DESC), so every category
-- page filters then sorts across all published rows. `status` is omitted from
-- the key because the partial predicate already pins it to a single value.
CREATE INDEX IF NOT EXISTS idx_products_published_category_created
  ON public.products (category, created_at DESC)
  WHERE status = 'published';

-- One partial index per facet rather than a single wide composite. Postgres can
-- BitmapAnd several of these for arbitrary facet combinations, which is the
-- right shape for a multi-select filter sheet; a composite would only ever serve
-- one prefix order.
CREATE INDEX IF NOT EXISTS idx_products_condition_created
  ON public.products (condition, created_at DESC)
  WHERE status = 'published' AND condition IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_size
  ON public.products (size)
  WHERE status = 'published' AND size IS NOT NULL;

-- lower(...) expression indexes because the app filters case-insensitively
-- throughout — app/api/v2/search/route.ts compares LOWER(COALESCE(p.category,''))
-- and the fallback path uses .ilike(). Brand and colour filters follow suit.
CREATE INDEX IF NOT EXISTS idx_products_brand_lower
  ON public.products (lower(brand))
  WHERE status = 'published' AND brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_color_lower
  ON public.products (lower(color))
  WHERE status = 'published' AND color IS NOT NULL;

-- Trigram index for brand autocomplete / fuzzy brand matching ("carhart" →
-- "Carhartt"), mirroring idx_products_title_trgm.
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING GIN (brand gin_trgm_ops)
  WHERE status = 'published';

-- Note: six new partial indexes add write amplification on an actively-edited
-- table. Negligible at MVP row counts. 20260225_db_hygiene.sql documents the
-- pg_stat_user_indexes query for pruning unused ones later.

-- ============================================================================
-- PART 5: EXTEND THE SEARCH VECTOR WITH brand
-- ============================================================================
-- Mechanism confirmed against 20260225_search_trigram.sql: search_vector is a
-- plain tsvector column maintained by a BEFORE INSERT OR UPDATE OF trigger, NOT
-- a GENERATED ALWAYS AS ... STORED column. So it is extended by replacing the
-- function AND recreating the trigger.
--
-- Brand is weighted A, the same as title, because on a resale marketplace the
-- brand is what people type. Drop to weight B if relevance regressions appear.
--
-- Not converting search_vector to a generated column: that would require
-- dropping and re-adding the column, rebuilding the GIN index under an ACCESS
-- EXCLUSIVE lock, and to_tsvector('english', ...) is only immutable enough for
-- a generated column when the config is spelled as a literal regconfig, which
-- is fragile across environments.

CREATE OR REPLACE FUNCTION public.update_product_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$;

-- The trigger MUST be recreated, not just the function. The `UPDATE OF <cols>`
-- clause means the trigger only fires when one of the listed columns appears in
-- the SET list — without `brand` there, a seller editing only the brand would
-- leave a stale search_vector forever. CREATE OR REPLACE on the function alone
-- does not change the trigger's column list.
DROP TRIGGER IF EXISTS trg_products_search_vector ON public.products;
CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE OF title, description, brand ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_search_vector();

-- Deliberately NOT doing an unconditional recompute of every row.
-- `brand` was created NULL on every existing row two parts ago, so
-- setweight(to_tsvector('english', COALESCE(brand,'')), 'A') contributes an
-- empty tsvector and the recomputed value would be byte-identical to what is
-- already stored — a full table rewrite for zero change. Worse, products carries
-- an unconditional `set_products_updated_at BEFORE UPDATE FOR EACH ROW` trigger
-- (scripts/046_fix_product_persistence.sql), so a blanket UPDATE would bump
-- updated_at on every product in the catalogue as a side effect.
--
-- Rows that acquire a brand from here on are covered by the trigger above.
-- This backfill only repairs rows that never got a vector at all (e.g. inserted
-- before 20260225_search_trigram.sql), and is a no-op on a healthy database.
UPDATE public.products
SET search_vector = (
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(brand, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B')
)
WHERE search_vector IS NULL;

-- The existing idx_products_search_vector GIN index needs no change.

-- ============================================================================
-- PART 6: GRANTS — RLS IS INTENTIONALLY UNTOUCHED
-- ============================================================================
-- No CREATE POLICY / DROP POLICY on public.products anywhere in this migration.
-- The existing policy set (scripts/040_add_product_archive_and_duplicate.sql and
-- scripts/015_fix_public_access_rls.sql) is load-bearing: "Published products are
-- viewable by everyone" carries an OR EXISTS(creators ...) clause that preserves
-- creator visibility of their own drafts, and a naive recreate would regress it.
--
-- Adding columns cannot break RLS — policies are row-level, not column-level,
-- and new columns inherit the existing table-level grant. Anonymous read of
-- published products is unaffected. The grant below is a defensive re-assert
-- only, matching 20260407_website_builder_public_read_hardened.sql.
GRANT SELECT ON public.products TO anon, authenticated;

-- ============================================================================
-- Rollback (manual, if ever needed):
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS size, DROP COLUMN IF EXISTS size_system,
--     DROP COLUMN IF EXISTS condition, DROP COLUMN IF EXISTS brand,
--     DROP COLUMN IF EXISTS color;
--   -- then restore update_product_search_vector() and its trigger from
--   -- 20260225_search_trigram.sql (dropping brand also drops it from the
--   -- trigger's UPDATE OF list automatically).
-- ============================================================================



-- ###########################################################################
--  SECTION  2: Subcategory, era, tags, drafts, the brand directory, the photo bucket
--  source: supabase/migrations/20260801_listing_attributes.sql
-- ###########################################################################

-- ============================================================================
-- storelib — resale listing attributes
--
-- Everything the "List an item" form captures, plus a brand directory to search
-- against. Additive only: no table is dropped, no column is retyped, nothing
-- existing is rewritten. Safe to run more than once.
--
-- Why columns on products rather than new tables: every one of these is exactly
-- one value (or one short list) per listing, always read WITH the listing and
-- never on its own. Joining five lookup tables to render a card would cost far
-- more than it buys. Brands are the exception — they need to be searched
-- independently of any listing, so they get a table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Listing attributes
-- ---------------------------------------------------------------------------
alter table public.products
  -- Leaf of the category tree, e.g. "hoodies". products.category already holds
  -- the top level ("menswear"); this is the level the buyer actually filters on.
  add column if not exists subcategory   text,
  -- Single choice. Free text rather than an enum so adding a colour later is a
  -- deploy, not a migration with a table lock.
  add column if not exists colour        text,
  -- "Up to 2" — vintage, preloved, reworked, upcycled, custom, handmade, deadstock,
  -- designer, repaired.
  add column if not exists source_tags   text[] default '{}'::text[],
  -- modern | 2000s | 1990s | 1980s | 1970s | 1960s | 1950s | antique
  add column if not exists era           text,
  -- streetwear, y2k, grunge, minimalist, … Several per listing.
  add column if not exists style_tags    text[] default '{}'::text[],
  -- Set when a listing is saved as a draft, so an abandoned form is recoverable.
  add column if not exists draft_saved_at timestamptz;

-- Guard rails that match the form. CHECKs (not enums) so the allowed set can
-- grow without rewriting the table.
--
-- `not valid` on both, and the reason is a failure this file's sibling actually
-- hit: a dropped-and-re-added constraint VALIDATES every existing row, so one
-- listing that predates the cap does not merely fail to be fixed — it aborts
-- the whole run and leaves every section after this one unapplied. The cap is
-- enforced on every write from here on either way; what `not valid` gives up is
-- only the retroactive scan, which was never going to repair anything.
--
-- Sweep the history once you know it is clean:
--   alter table public.products validate constraint products_source_tags_max;
alter table public.products drop constraint if exists products_source_tags_max;
alter table public.products
  add constraint products_source_tags_max
  check (source_tags is null or array_length(source_tags, 1) is null or array_length(source_tags, 1) <= 2)
  not valid;

alter table public.products drop constraint if exists products_style_tags_max;
alter table public.products
  add constraint products_style_tags_max
  check (style_tags is null or array_length(style_tags, 1) is null or array_length(style_tags, 1) <= 3)
  not valid;

-- Filter indexes. Partial on published: nobody filters over drafts, and it keeps
-- the indexes to the rows the feed actually scans.
create index if not exists idx_products_subcategory
  on public.products (subcategory) where status = 'published';
create index if not exists idx_products_colour
  on public.products (colour) where status = 'published';
create index if not exists idx_products_era
  on public.products (era) where status = 'published';
create index if not exists idx_products_brand
  on public.products (brand) where status = 'published';
create index if not exists idx_products_condition
  on public.products (condition) where status = 'published';
-- GIN for array containment: "any listing tagged vintage".
create index if not exists idx_products_source_tags on public.products using gin (source_tags);
create index if not exists idx_products_style_tags  on public.products using gin (style_tags);

-- ---------------------------------------------------------------------------
-- 2. Brand directory
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  -- Higher sorts first, so the names people actually search for lead the list.
  popularity int  not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_brands_name_lower on public.brands (lower(name));
create index if not exists idx_brands_popularity on public.brands (popularity desc, name);
-- Trigram, so "balencia" finds Balenciaga. pg_trgm is already enabled by
-- 20260730_wishlist_and_search_indexes.sql; repeated here so this file stands alone.
create extension if not exists pg_trgm;
create index if not exists idx_brands_name_trgm on public.brands using gin (name gin_trgm_ops);

alter table public.brands enable row level security;

-- A public directory: anyone may read it, nobody may write it from the client.
-- Seeding and curation happen through the service role.
drop policy if exists "brands are readable by everyone" on public.brands;
create policy "brands are readable by everyone" on public.brands for select using (true);

-- ---------------------------------------------------------------------------
-- 3. Brand seed
--
-- ~483 names, weighted so the ones people actually search for lead the list.
-- Idempotent: re-running updates popularity and leaves everything else alone,
-- so this file can be extended and re-applied as the list grows.
--
-- "Other" is NOT in here. It isn't a brand — it's what the form falls back to
-- when a search finds nothing, and storing it as a row would put it in the
-- results for every query.
-- ---------------------------------------------------------------------------
insert into public.brands (name, slug, popularity) values
  ('Nike', 'nike', 100),
  ('Adidas', 'adidas', 100),
  ('Zara', 'zara', 98),
  ('H&M', 'h-m', 98),
  ('Levi''s', 'levi-s', 96),
  ('The North Face', 'the-north-face', 96),
  ('Carhartt', 'carhartt', 95),
  ('Ralph Lauren', 'ralph-lauren', 95),
  ('Tommy Hilfiger', 'tommy-hilfiger', 94),
  ('Champion', 'champion', 94),
  ('Puma', 'puma', 93),
  ('Vans', 'vans', 93),
  ('Converse', 'converse', 92),
  ('New Balance', 'new-balance', 92),
  ('Reebok', 'reebok', 91),
  ('Under Armour', 'under-armour', 90),
  ('Stussy', 'stussy', 90),
  ('Supreme', 'supreme', 90),
  ('Patagonia', 'patagonia', 89),
  ('Columbia', 'columbia', 88),
  ('Uniqlo', 'uniqlo', 88),
  ('Bershka', 'bershka', 87),
  ('Pull&Bear', 'pull-bear', 87),
  ('Stradivarius', 'stradivarius', 86),
  ('Mango', 'mango', 86),
  ('ASOS', 'asos', 85),
  ('Topshop', 'topshop', 85),
  ('Urban Outfitters', 'urban-outfitters', 84),
  ('Brandy Melville', 'brandy-melville', 84),
  ('Shein', 'shein', 83),
  ('Primark', 'primark', 83),
  ('Gap', 'gap', 82),
  ('Old Navy', 'old-navy', 80),
  ('American Eagle', 'american-eagle', 80),
  ('Abercrombie & Fitch', 'abercrombie-fitch', 80),
  ('Hollister', 'hollister', 79),
  ('Superdry', 'superdry', 78),
  ('Jack & Jones', 'jack-jones', 78),
  ('Only', 'only', 76),
  ('Vero Moda', 'vero-moda', 76),
  ('Massimo Dutti', 'massimo-dutti', 76),
  ('COS', 'cos', 75),
  ('Arket', 'arket', 74),
  ('Weekday', 'weekday', 74),
  ('Monki', 'monki', 73),
  ('& Other Stories', 'other-stories', 73),
  ('Reserved', 'reserved', 72),
  ('Cropp', 'cropp', 71),
  ('House', 'house', 70),
  ('Sinsay', 'sinsay', 70),
  ('Mohito', 'mohito', 69),
  ('Answear', 'answear', 66),
  ('Nasty Gal', 'nasty-gal', 68),
  ('PrettyLittleThing', 'prettylittlething', 68),
  ('Boohoo', 'boohoo', 67),
  ('Missguided', 'missguided', 66),
  ('Fashion Nova', 'fashion-nova', 65),
  ('Zaful', 'zaful', 62),
  ('Romwe', 'romwe', 60),
  ('Gucci', 'gucci', 97),
  ('Prada', 'prada', 96),
  ('Louis Vuitton', 'louis-vuitton', 96),
  ('Balenciaga', 'balenciaga', 95),
  ('Dior', 'dior', 95),
  ('Chanel', 'chanel', 95),
  ('Versace', 'versace', 94),
  ('Fendi', 'fendi', 93),
  ('Burberry', 'burberry', 93),
  ('Saint Laurent', 'saint-laurent', 92),
  ('Givenchy', 'givenchy', 91),
  ('Valentino', 'valentino', 90),
  ('Bottega Veneta', 'bottega-veneta', 90),
  ('Balmain', 'balmain', 88),
  ('Alexander McQueen', 'alexander-mcqueen', 88),
  ('Off-White', 'off-white', 88),
  ('Moncler', 'moncler', 87),
  ('Stone Island', 'stone-island', 87),
  ('CP Company', 'cp-company', 84),
  ('Canada Goose', 'canada-goose', 84),
  ('Loewe', 'loewe', 83),
  ('Celine', 'celine', 83),
  ('Hermes', 'hermes', 85),
  ('Armani', 'armani', 86),
  ('Emporio Armani', 'emporio-armani', 85),
  ('Dolce & Gabbana', 'dolce-gabbana', 86),
  ('Moschino', 'moschino', 84),
  ('Kenzo', 'kenzo', 82),
  ('Marni', 'marni', 80),
  ('Acne Studios', 'acne-studios', 80),
  ('Maison Margiela', 'maison-margiela', 80),
  ('Comme des Garcons', 'comme-des-garcons', 80),
  ('Issey Miyake', 'issey-miyake', 78),
  ('Yohji Yamamoto', 'yohji-yamamoto', 77),
  ('Rick Owens', 'rick-owens', 79),
  ('Ann Demeulemeester', 'ann-demeulemeester', 72),
  ('Dries Van Noten', 'dries-van-noten', 74),
  ('Jil Sander', 'jil-sander', 75),
  ('Lemaire', 'lemaire', 72),
  ('The Row', 'the-row', 75),
  ('Toteme', 'toteme', 72),
  ('Ganni', 'ganni', 76),
  ('Isabel Marant', 'isabel-marant', 76),
  ('Chloe', 'chloe', 78),
  ('Miu Miu', 'miu-miu', 82),
  ('Michael Kors', 'michael-kors', 82),
  ('Coach', 'coach', 82),
  ('Kate Spade', 'kate-spade', 78),
  ('Marc Jacobs', 'marc-jacobs', 80),
  ('Tory Burch', 'tory-burch', 76),
  ('Longchamp', 'longchamp', 76),
  ('Furla', 'furla', 70),
  ('Guess', 'guess', 82),
  ('Calvin Klein', 'calvin-klein', 88),
  ('DKNY', 'dkny', 76),
  ('Lacoste', 'lacoste', 85),
  ('Fred Perry', 'fred-perry', 82),
  ('Ben Sherman', 'ben-sherman', 72),
  ('Paul Smith', 'paul-smith', 74),
  ('Ted Baker', 'ted-baker', 74),
  ('Hugo Boss', 'hugo-boss', 84),
  ('Diesel', 'diesel', 82),
  ('Replay', 'replay', 72),
  ('G-Star Raw', 'g-star-raw', 76),
  ('Wrangler', 'wrangler', 78),
  ('Lee', 'lee', 78),
  ('True Religion', 'true-religion', 76),
  ('Ed Hardy', 'ed-hardy', 68),
  ('Von Dutch', 'von-dutch', 66),
  ('Juicy Couture', 'juicy-couture', 74),
  ('Roxy', 'roxy', 70),
  ('Quiksilver', 'quiksilver', 72),
  ('Billabong', 'billabong', 72),
  ('Rip Curl', 'rip-curl', 70),
  ('O''Neill', 'o-neill', 68),
  ('Volcom', 'volcom', 70),
  ('Element', 'element', 68),
  ('DC Shoes', 'dc-shoes', 70),
  ('Etnies', 'etnies', 64),
  ('Emerica', 'emerica', 60),
  ('Thrasher', 'thrasher', 76),
  ('Palace', 'palace', 82),
  ('Bape', 'bape', 84),
  ('Human Made', 'human-made', 72),
  ('Neighborhood', 'neighborhood', 70),
  ('WTAPS', 'wtaps', 68),
  ('Undercover', 'undercover', 72),
  ('Kapital', 'kapital', 68),
  ('Visvim', 'visvim', 68),
  ('Needles', 'needles', 70),
  ('Noah', 'noah', 68),
  ('Aime Leon Dore', 'aime-leon-dore', 76),
  ('Kith', 'kith', 78),
  ('Corteiz', 'corteiz', 76),
  ('Trapstar', 'trapstar', 74),
  ('Represent', 'represent', 72),
  ('Essentials', 'essentials', 82),
  ('Fear of God', 'fear-of-god', 82),
  ('Yeezy', 'yeezy', 84),
  ('Broken Planet', 'broken-planet', 68),
  ('Sp5der', 'sp5der', 72),
  ('Hellstar', 'hellstar', 70),
  ('Denim Tears', 'denim-tears', 70),
  ('Rhude', 'rhude', 70),
  ('Amiri', 'amiri', 78),
  ('Palm Angels', 'palm-angels', 76),
  ('Golden Goose', 'golden-goose', 78),
  ('Common Projects', 'common-projects', 70),
  ('Veja', 'veja', 76),
  ('Salomon', 'salomon', 80),
  ('Asics', 'asics', 84),
  ('Saucony', 'saucony', 74),
  ('Brooks', 'brooks', 70),
  ('Hoka', 'hoka', 76),
  ('On Running', 'on-running', 76),
  ('Merrell', 'merrell', 68),
  ('Timberland', 'timberland', 82),
  ('Dr. Martens', 'dr-martens', 85),
  ('Clarks', 'clarks', 76),
  ('Birkenstock', 'birkenstock', 82),
  ('Crocs', 'crocs', 80),
  ('UGG', 'ugg', 82),
  ('Hunter', 'hunter', 72),
  ('Havaianas', 'havaianas', 68),
  ('Teva', 'teva', 64),
  ('Vivobarefoot', 'vivobarefoot', 58),
  ('Jordan', 'jordan', 90),
  ('Air Jordan', 'air-jordan', 88),
  ('Nike SB', 'nike-sb', 76),
  ('Adidas Originals', 'adidas-originals', 84),
  ('Y-3', 'y-3', 72),
  ('Gazelle', 'gazelle', 68),
  ('Umbro', 'umbro', 70),
  ('Kappa', 'kappa', 74),
  ('Fila', 'fila', 80),
  ('Ellesse', 'ellesse', 74),
  ('Sergio Tacchini', 'sergio-tacchini', 68),
  ('Lonsdale', 'lonsdale', 64),
  ('Everlast', 'everlast', 64),
  ('Slazenger', 'slazenger', 60),
  ('Le Coq Sportif', 'le-coq-sportif', 62),
  ('Diadora', 'diadora', 64),
  ('Lotto', 'lotto', 60),
  ('Mizuno', 'mizuno', 66),
  ('Wilson', 'wilson', 62),
  ('Oakley', 'oakley', 74),
  ('Ray-Ban', 'ray-ban', 82),
  ('Persol', 'persol', 64),
  ('Maui Jim', 'maui-jim', 58),
  ('Casio', 'casio', 76),
  ('Seiko', 'seiko', 72),
  ('Citizen', 'citizen', 68),
  ('Fossil', 'fossil', 70),
  ('Daniel Wellington', 'daniel-wellington', 66),
  ('Swatch', 'swatch', 70),
  ('Rolex', 'rolex', 80),
  ('Omega', 'omega', 72),
  ('Tag Heuer', 'tag-heuer', 70),
  ('Tissot', 'tissot', 66),
  ('Pandora', 'pandora', 76),
  ('Swarovski', 'swarovski', 74),
  ('Thomas Sabo', 'thomas-sabo', 62),
  ('Tiffany & Co', 'tiffany-co', 76),
  ('Cartier', 'cartier', 76),
  ('Bvlgari', 'bvlgari', 70),
  ('Victoria''s Secret', 'victoria-s-secret', 78),
  ('Calzedonia', 'calzedonia', 70),
  ('Intimissimi', 'intimissimi', 68),
  ('Tezenis', 'tezenis', 66),
  ('Triumph', 'triumph', 62),
  ('Wolford', 'wolford', 58),
  ('Falke', 'falke', 56),
  ('Nike ACG', 'nike-acg', 66),
  ('Arc''teryx', 'arc-teryx', 80),
  ('Mammut', 'mammut', 64),
  ('Jack Wolfskin', 'jack-wolfskin', 66),
  ('Berghaus', 'berghaus', 62),
  ('Rab', 'rab', 60),
  ('Haglofs', 'haglofs', 58),
  ('Fjallraven', 'fjallraven', 74),
  ('Helly Hansen', 'helly-hansen', 70),
  ('Peak Performance', 'peak-performance', 60),
  ('Napapijri', 'napapijri', 72),
  ('Ellesse Heritage', 'ellesse-heritage', 58),
  ('Barbour', 'barbour', 74),
  ('Belstaff', 'belstaff', 66),
  ('Schott NYC', 'schott-nyc', 66),
  ('Alpha Industries', 'alpha-industries', 72),
  ('Avirex', 'avirex', 64),
  ('Wrangler Western', 'wrangler-western', 56),
  ('Levi''s Vintage Clothing', 'levi-s-vintage-clothing', 66),
  ('Nudie Jeans', 'nudie-jeans', 64),
  ('Edwin', 'edwin', 62),
  ('Evisu', 'evisu', 64),
  ('A.P.C.', 'a-p-c', 70),
  ('Sandro', 'sandro', 70),
  ('Maje', 'maje', 68),
  ('Claudie Pierlot', 'claudie-pierlot', 60),
  ('The Kooples', 'the-kooples', 64),
  ('Zadig & Voltaire', 'zadig-voltaire', 66),
  ('Ba&sh', 'ba-sh', 62),
  ('Sezane', 'sezane', 68),
  ('Reformation', 'reformation', 72),
  ('Realisation Par', 'realisation-par', 62),
  ('House of CB', 'house-of-cb', 64),
  ('Self-Portrait', 'self-portrait', 66),
  ('Alice + Olivia', 'alice-olivia', 60),
  ('Diane von Furstenberg', 'diane-von-furstenberg', 62),
  ('Anthropologie', 'anthropologie', 68),
  ('Free People', 'free-people', 72),
  ('Lululemon', 'lululemon', 82),
  ('Gymshark', 'gymshark', 80),
  ('Alo Yoga', 'alo-yoga', 76),
  ('Sweaty Betty', 'sweaty-betty', 64),
  ('Oysho', 'oysho', 66),
  ('Decathlon', 'decathlon', 76),
  ('Kalenji', 'kalenji', 54),
  ('Domyos', 'domyos', 54),
  ('Quechua', 'quechua', 58),
  ('Hey Dude', 'hey-dude', 68),
  ('Skechers', 'skechers', 74),
  ('Geox', 'geox', 66),
  ('Ecco', 'ecco', 64),
  ('Camper', 'camper', 64),
  ('Aldo', 'aldo', 66),
  ('Steve Madden', 'steve-madden', 70),
  ('Dune London', 'dune-london', 58),
  ('Office', 'office', 56),
  ('Schuh', 'schuh', 58),
  ('Deichmann', 'deichmann', 62),
  ('Bata', 'bata', 58),
  ('Ccc', 'ccc', 58),
  ('Diamond Supply Co', 'diamond-supply-co', 66),
  ('Obey', 'obey', 70),
  ('Huf', 'huf', 68),
  ('Primitive', 'primitive', 60),
  ('Anti Social Social Club', 'anti-social-social-club', 70),
  ('Vlone', 'vlone', 68),
  ('Revenge', 'revenge', 62),
  ('Chrome Hearts', 'chrome-hearts', 74),
  ('Gallery Dept', 'gallery-dept', 70),
  ('Cactus Plant Flea Market', 'cactus-plant-flea-market', 60),
  ('Madhappy', 'madhappy', 62),
  ('Brain Dead', 'brain-dead', 62),
  ('Online Ceramics', 'online-ceramics', 60),
  ('Cav Empt', 'cav-empt', 62),
  ('Mastermind Japan', 'mastermind-japan', 60),
  ('Ambush', 'ambush', 62),
  ('Heron Preston', 'heron-preston', 64),
  ('1017 ALYX 9SM', '1017-alyx-9sm', 64),
  ('A-Cold-Wall', 'a-cold-wall', 64),
  ('Craig Green', 'craig-green', 58),
  ('JW Anderson', 'jw-anderson', 66),
  ('Martine Rose', 'martine-rose', 62),
  ('Wales Bonner', 'wales-bonner', 62),
  ('Bianca Saunders', 'bianca-saunders', 54),
  ('Grace Wales', 'grace-wales', 50),
  ('Nanushka', 'nanushka', 58),
  ('Jacquemus', 'jacquemus', 76),
  ('Coperni', 'coperni', 60),
  ('Courreges', 'courreges', 58),
  ('Mugler', 'mugler', 64),
  ('Thierry Mugler', 'thierry-mugler', 58),
  ('Alaia', 'alaia', 62),
  ('Ferragamo', 'ferragamo', 72),
  ('Tod''s', 'tod-s', 66),
  ('Church''s', 'church-s', 60),
  ('Berluti', 'berluti', 58),
  ('Zegna', 'zegna', 68),
  ('Brunello Cucinelli', 'brunello-cucinelli', 68),
  ('Loro Piana', 'loro-piana', 70),
  ('Herno', 'herno', 60),
  ('Max Mara', 'max-mara', 72),
  ('Marella', 'marella', 58),
  ('Weekend Max Mara', 'weekend-max-mara', 56),
  ('Twinset', 'twinset', 58),
  ('Pinko', 'pinko', 64),
  ('Patrizia Pepe', 'patrizia-pepe', 58),
  ('Liu Jo', 'liu-jo', 60),
  ('Elisabetta Franchi', 'elisabetta-franchi', 56),
  ('Motivi', 'motivi', 52),
  ('Benetton', 'benetton', 66),
  ('Sisley', 'sisley', 60),
  ('Diesel Black Gold', 'diesel-black-gold', 54),
  ('Iceberg', 'iceberg', 56),
  ('Blumarine', 'blumarine', 60),
  ('Roberto Cavalli', 'roberto-cavalli', 64),
  ('Just Cavalli', 'just-cavalli', 58),
  ('Philipp Plein', 'philipp-plein', 64),
  ('Dsquared2', 'dsquared2', 72),
  ('John Richmond', 'john-richmond', 54),
  ('Bikkembergs', 'bikkembergs', 54),
  ('Antony Morato', 'antony-morato', 56),
  ('Gaudi', 'gaudi', 50),
  ('Guess Jeans', 'guess-jeans', 66),
  ('Tommy Jeans', 'tommy-jeans', 74),
  ('Calvin Klein Jeans', 'calvin-klein-jeans', 76),
  ('Pepe Jeans', 'pepe-jeans', 68),
  ('Salsa', 'salsa', 52),
  ('Mustang', 'mustang', 54),
  ('Big Star', 'big-star', 50),
  ('Cross Jeans', 'cross-jeans', 48),
  ('Colin''s', 'colin-s', 52),
  ('Koton', 'koton', 56),
  ('LC Waikiki', 'lc-waikiki', 58),
  ('DeFacto', 'defacto', 54),
  ('Mavi', 'mavi', 58),
  ('Trendyol', 'trendyol', 58),
  ('Bershka Denim', 'bershka-denim', 50),
  ('Springfield', 'springfield', 56),
  ('Cortefiel', 'cortefiel', 52),
  ('Desigual', 'desigual', 64),
  ('Scalpers', 'scalpers', 56),
  ('Ecoalf', 'ecoalf', 52),
  ('Bimba y Lola', 'bimba-y-lola', 58),
  ('Uterque', 'uterque', 54),
  ('Adolfo Dominguez', 'adolfo-dominguez', 52),
  ('Purificacion Garcia', 'purificacion-garcia', 48),
  ('Roberto Verino', 'roberto-verino', 46),
  ('El Ganso', 'el-ganso', 50),
  ('Silbon', 'silbon', 46),
  ('Hackett', 'hackett', 60),
  ('Gant', 'gant', 68),
  ('Nautica', 'nautica', 70),
  ('Dockers', 'dockers', 64),
  ('Eddie Bauer', 'eddie-bauer', 60),
  ('L.L.Bean', 'l-l-bean', 62),
  ('Woolrich', 'woolrich', 66),
  ('Filson', 'filson', 58),
  ('Pendleton', 'pendleton', 58),
  ('Duluth Trading', 'duluth-trading', 50),
  ('Dickies', 'dickies', 80),
  ('Ben Davis', 'ben-davis', 56),
  ('Wrangler Riggs', 'wrangler-riggs', 48),
  ('Red Kap', 'red-kap', 46),
  ('Bulwark', 'bulwark', 42),
  ('Snickers', 'snickers', 46),
  ('Engelbert Strauss', 'engelbert-strauss', 46),
  ('Blaklader', 'blaklader', 44),
  ('Helly Hansen Workwear', 'helly-hansen-workwear', 46),
  ('Mascot', 'mascot', 42),
  ('Timberland PRO', 'timberland-pro', 52),
  ('Caterpillar', 'caterpillar', 66),
  ('Palladium', 'palladium', 60),
  ('Grenson', 'grenson', 52),
  ('Loake', 'loake', 50),
  ('Barker', 'barker', 46),
  ('Trickers', 'trickers', 50),
  ('Sanders', 'sanders', 46),
  ('Solovair', 'solovair', 54),
  ('Gripfast', 'gripfast', 42),
  ('Underground', 'underground', 46),
  ('Buffalo London', 'buffalo-london', 58),
  ('Demonia', 'demonia', 60),
  ('Iron Fist', 'iron-fist', 48),
  ('Killstar', 'killstar', 58),
  ('Disturbia', 'disturbia', 52),
  ('Dolls Kill', 'dolls-kill', 62),
  ('Sourpuss', 'sourpuss', 44),
  ('Hell Bunny', 'hell-bunny', 48),
  ('Collectif', 'collectif', 50),
  ('Vivien of Holloway', 'vivien-of-holloway', 44),
  ('Voodoo Vixen', 'voodoo-vixen', 42),
  ('Lindy Bop', 'lindy-bop', 44),
  ('Unique Vintage', 'unique-vintage', 48),
  ('ModCloth', 'modcloth', 54),
  ('Princess Polly', 'princess-polly', 64),
  ('Motel Rocks', 'motel-rocks', 58),
  ('Jaded London', 'jaded-london', 60),
  ('Weekday Denim', 'weekday-denim', 48),
  ('Monki Denim', 'monki-denim', 46),
  ('Cider', 'cider', 60),
  ('Zaful Beach', 'zaful-beach', 44),
  ('Cupshe', 'cupshe', 48),
  ('Aerie', 'aerie', 64),
  ('PacSun', 'pacsun', 62),
  ('Zumiez', 'zumiez', 58),
  ('Tillys', 'tillys', 52),
  ('Garage', 'garage', 52),
  ('Ardene', 'ardene', 48),
  ('Bluenotes', 'bluenotes', 44),
  ('Roots', 'roots', 56),
  ('Aritzia', 'aritzia', 68),
  ('Wilfred', 'wilfred', 54),
  ('TNA', 'tna', 52),
  ('Babaton', 'babaton', 50),
  ('Frank And Oak', 'frank-and-oak', 48),
  ('Everlane', 'everlane', 62),
  ('Cuyana', 'cuyana', 50),
  ('Quince', 'quince', 48),
  ('Naadam', 'naadam', 46),
  ('Vuori', 'vuori', 60),
  ('Outdoor Voices', 'outdoor-voices', 56),
  ('Girlfriend Collective', 'girlfriend-collective', 54),
  ('Set Active', 'set-active', 52),
  ('Halara', 'halara', 54),
  ('Oner Active', 'oner-active', 52),
  ('Nvgtn', 'nvgtn', 54),
  ('Buffbunny', 'buffbunny', 46),
  ('Ryderwear', 'ryderwear', 48),
  ('Bo+Tee', 'bo-tee', 54),
  ('Oh Polly', 'oh-polly', 58),
  ('White Fox', 'white-fox', 60),
  ('Meshki', 'meshki', 56),
  ('Beginning Boutique', 'beginning-boutique', 48),
  ('Showpo', 'showpo', 50),
  ('Peppermayo', 'peppermayo', 52),
  ('Selfie Leslie', 'selfie-leslie', 46),
  ('Tiger Mist', 'tiger-mist', 48),
  ('Sabo Skirt', 'sabo-skirt', 44),
  ('Verge Girl', 'verge-girl', 44),
  ('With Jean', 'with-jean', 46),
  ('Realisation', 'realisation', 46),
  ('Faithfull the Brand', 'faithfull-the-brand', 50),
  ('Zimmermann', 'zimmermann', 64),
  ('Camilla', 'camilla', 52),
  ('Aje', 'aje', 50),
  ('Bec + Bridge', 'bec-bridge', 48),
  ('Alemais', 'alemais', 46),
  ('Cult Gaia', 'cult-gaia', 54),
  ('Staud', 'staud', 56),
  ('Mango Man', 'mango-man', 54),
  ('Zara Man', 'zara-man', 60),
  ('Massimo Dutti Man', 'massimo-dutti-man', 52)
on conflict (slug) do update set popularity = excluded.popularity;

-- ---------------------------------------------------------------------------
-- 4. Listing photo storage
--
-- A public bucket: listing photos are shown to everyone, and signing every
-- thumbnail in a feed would be pointless work. Writes are restricted to the
-- owner's own folder, so one seller can never overwrite another's photo.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('listings', 'listings', true)
on conflict (id) do update set public = true;

drop policy if exists "listing photos are public" on storage.objects;
create policy "listing photos are public"
  on storage.objects for select
  using (bucket_id = 'listings');

drop policy if exists "sellers upload their own listing photos" on storage.objects;
create policy "sellers upload their own listing photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "sellers manage their own listing photos" on storage.objects;
create policy "sellers manage their own listing photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listings' and (storage.foldername(name))[1] = auth.uid()::text);



-- ###########################################################################
--  SECTION  3: Search and wishlist indexes
--  source: supabase/migrations/20260730_wishlist_and_search_indexes.sql
-- ###########################################################################

-- ============================================================================
-- storelib — performance indexes for the marketplace pivot
--
-- Safe to run any time and more than once (every statement is IF NOT EXISTS).
-- This file creates NO tables and changes NO data — indexes only.
--
-- Nothing here is strictly REQUIRED for the features to work; they make the new
-- "total saves" count on listings and the search / autocomplete fast at scale.
-- ============================================================================

-- 1) Total-saves count per listing (feed cards + the Saved tab).
--    The count aggregates public.wishlist_items grouped by product_id, so the
--    product_id index is what keeps that query cheap as saves grow.
create index if not exists idx_wishlist_items_product_id
  on public.wishlist_items (product_id);

-- Fast per-user / per-guest wishlist reads (loading a user's saved items).
create index if not exists idx_wishlist_items_user_id
  on public.wishlist_items (user_id);
create index if not exists idx_wishlist_items_guest_id
  on public.wishlist_items (guest_id);

-- 2) Search + autocomplete used by the full-screen search overlay
--    (/api/v2/search and /api/v2/search/people). Trigram GIN indexes make the
--    ILIKE / fuzzy matching fast. pg_trgm ships with Supabase.
create extension if not exists pg_trgm;

create index if not exists idx_products_title_trgm
  on public.products using gin (title gin_trgm_ops);
create index if not exists idx_products_description_trgm
  on public.products using gin (description gin_trgm_ops);

-- brand exists after 20260730_marketplace_physical_attributes.sql (already run).
create index if not exists idx_products_brand_trgm
  on public.products using gin (brand gin_trgm_ops);

create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (username gin_trgm_ops);
create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);



-- ###########################################################################
--  SECTION  4: Messaging, notifications, follows, safety
--  source: supabase/sql/RUN_MESSAGING_ALL.sql
-- ###########################################################################

-- ===========================================================================
-- STORELIB — MESSAGING, ALL OF IT, IN ORDER  (run this one file)
-- ===========================================================================
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Why this file exists: `20260806_message_images_and_safety.sql` failed with
--   ERROR: 42P01: relation "public.messages" does not exist
-- which is not a fault in that migration — it is that the migration which
-- CREATES public.messages had never been run. 20260806 only adds a column to a
-- table it assumed was already there.
--
-- Every messaging migration is concatenated here in dependency order: the
-- tables, notifications, the official Storelib account, photos and the safety
-- actions, then realtime and unsending. Every statement guards itself (create
-- if not exists / drop policy if exists / add column if not exists), so running
-- this is safe whether you have none of it, some of it, or all of it already.
--
-- NO PREREQUISITES. An earlier version of this file said public.products and
-- public.profiles had to exist first — they did not, and saying so was worse
-- than useless because it made the 42P01 look like your database's fault. Every
-- reference to them is now conditional: the messaging schema installs on an
-- empty database, and picks up its foreign keys and the is_official flag the
-- moment those tables appear. Run this file again after them and the
-- constraints attach themselves.
--
-- The one thing to check BEFORE running it is that you are in the right
-- project. `products` coming back null in the select at the bottom, on a site
-- that is serving listings right now, means this ran somewhere the app never
-- reads.
-- ===========================================================================



-- ===========================================================================
-- Messaging: conversations, messages, offers
-- (supabase/migrations/20260802_messages_offers.sql)
-- ===========================================================================

-- Buyer–seller messaging, with offers as a first-class message kind.
--
-- One conversation per (listing, buyer). The seller is denormalised onto the
-- conversation so RLS can check membership without joining through products,
-- and so the inbox query is one indexed read per side.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid,  -- FK to public.products added conditionally at the end
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_distinct_parties check (buyer_id <> seller_id),
  unique (listing_id, buyer_id)
);

create index if not exists conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'offer')),
  body text,
  offer_cents integer check (offer_cents is null or offer_cents > 0),
  offer_status text check (offer_status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- A text message has a body; an offer has an amount and a status.
  constraint messages_shape check (
    (kind = 'text' and body is not null and offer_cents is null)
    or
    (kind = 'offer' and offer_cents is not null and offer_status is not null)
  )
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Participants can see their conversations; only a buyer can open one, and only
-- about someone else's listing (the parties check above enforces the latter).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (auth.uid() = buyer_id);

drop policy if exists conversations_touch on public.conversations;
create policy conversations_touch on public.conversations
  for update using (auth.uid() = buyer_id or auth.uid() = seller_id)
  with check (auth.uid() = buyer_id or auth.uid() = seller_id);

-- Messages: participants read; the sender writes as themself, into a
-- conversation they are part of.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Updates cover two distinct moves, and RLS only gates WHO; the API gates WHAT:
-- the counterparty answers an offer, and a reader marks the other side's
-- messages read. Both are "a participant touching a message they did not send".
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );


-- ===========================================================================
-- Notifications: the inbox's second tab
-- (supabase/migrations/20260803_notifications.sql)
-- ===========================================================================

-- Notifications: the inbox's second tab.
--
-- One row per event, addressed to one recipient. The row stores only ids —
-- who acted, which listing, which conversation — and the API enriches at read
-- time, so a renamed profile or retitled listing never leaves stale copy here.
-- Cascades mean a deleted account or listing takes its notifications with it.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'offer_received', 'offer_accepted', 'offer_declined', 'message')),
  actor_id uuid references auth.users(id) on delete cascade,
  listing_id uuid,  -- FK to public.products added conditionally at the end
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- The feed is always "my latest", and the badge is always "my unread" — one
-- index per question, the second partial because read rows never matter to it.
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- You read your own rows and mark your own rows read. There is deliberately NO
-- insert policy: notifications are created server-side through the admin
-- client from trusted code paths, so a client can never forge one — not even
-- for itself.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- And you may throw your own away.
--
-- This was missing, and its absence is a specific bug rather than a gap. RLS is
-- deny-by-default per COMMAND: with select and update policies present and no
-- delete policy, a DELETE is not rejected — it matches zero rows and reports
-- success. So the app's "dismiss notification" removed the row from the screen,
-- got `{ ok: true }` back, and watched it return on the next load, with nothing
-- anywhere saying why.
--
-- The app no longer deletes notifications at all (it marks them read, which is
-- what Depop and Vinted do and what the update policy above already allowed),
-- so this exists to make DELETE /api/notifications mean what it says if anything
-- ever calls it — an account teardown, a moderation tool — rather than to
-- restore a button.
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (auth.uid() = user_id);

-- "My unread, in this conversation" — the lookup that collapses a burst of
-- messages into one notification instead of one per line (lib/notifications.ts).
-- Partial, because a read row is never the answer to it.
create index if not exists notifications_convo_unread_idx
  on public.notifications (user_id, conversation_id)
  where read_at is null;


-- ===========================================================================
-- The official Storelib account
-- (supabase/migrations/20260804_system_account.sql)
-- ===========================================================================

-- storelib — the official Storelib account, sitting in every inbox.
--
-- Storelib itself should be a correspondent: it sends product news and selling
-- tips, and people can write back to it for support. That thread is about
-- nothing in particular — there is no listing behind it — which is the one
-- shape 20260802_messages_offers.sql did not allow, so this migration widens
-- the schema by exactly that much. Safe to run more than once.

-- A system thread has no item. listing_id stays a foreign key to products; it
-- just stops being mandatory, so a conversation can exist without one.
-- Already nullable above; kept for databases created by the older migration.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='conversations'
                and column_name='listing_id' and is_nullable='NO') then
    alter table public.conversations alter column listing_id drop not null;
  end if;
end $$;

-- Which of the two shapes a row is. Everything written before today is a
-- listing thread, and the default keeps the buyer→seller insert in
-- app/api/messages/route.ts correct without that route knowing this column
-- exists. `if not exists` skips the CHECK too on a re-run, which is what makes
-- the whole statement idempotent.
alter table public.conversations
  add column if not exists kind text not null default 'listing'
    check (kind in ('listing', 'system'));

-- The table's `unique (listing_id, buyer_id)` cannot police system rows: NULLs
-- are never equal to one another in a unique index, so every system thread
-- would read as distinct and a user could accumulate dozens. This partial
-- index is the real rule — one Storelib thread per person — and the
-- find-or-create in lib/system-account.ts leans on it to survive two requests
-- racing on a first page load.
create unique index if not exists conversations_system_unique
  on public.conversations (buyer_id)
  where kind = 'system';

-- The blue check. A boolean rather than a roles table, because "official" is
-- one bit about a handful of accounts and the inbox reads it in the same trip
-- that already fetches the display name.
do $$ begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists is_official boolean not null default false;
  end if;
end $$;

-- Row-level security needs no change here, and that is worth stating rather
-- than assuming:
--
--   conversations_select is (auth.uid() = buyer_id or auth.uid() = seller_id).
--   A person is the buyer_id on their own system thread, so they read it.
--
--   messages_select and messages_insert both test membership of the parent
--   conversation, so replying to Storelib is an ordinary message, and
--   messages_update lets the reader mark Storelib's messages read exactly the
--   way they mark a seller's.
--
--   conversations_insert (auth.uid() = buyer_id) is deliberately left alone.
--   System threads are created server-side with the service role, which
--   bypasses RLS entirely, so loosening this policy would buy nothing and
--   would only widen what a client is able to forge.
--
-- One inherited constraint does bite, and lib/system-account.ts respects it:
-- conversations_distinct_parties (buyer_id <> seller_id) means the Storelib
-- account cannot hold a system thread with itself. It is skipped rather than
-- special-cased.

-- ---------------------------------------------------------------------------
-- Operator step, deliberately not automated.
--
-- Pick the auth user that IS Storelib and mark its profile. Nothing above
-- invents that account: a uuid guessed in a migration would silently promote
-- somebody else's profile to official, and there is no undoing that quietly.
--
--   update public.profiles
--      set is_official  = true,
--          display_name = 'Storelib',
--          username     = 'storelib'
--    where id = '<uuid of the Storelib auth user>';
--
-- Then either set STORELIB_SYSTEM_USER_ID to that same uuid, or leave it unset
-- and let lib/system-account.ts find the flagged row on its own. Note that it
-- keys off is_official and not off the username: nothing reserves "storelib"
-- as a handle today, so the flag — which only this statement can set — is what
-- actually confers the identity.
--
-- Until one of those is true the feature is inert on purpose: no system thread
-- is created, no blue check renders, and the inbox behaves exactly as it did
-- before this file ran.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- Photos in a thread, blocking, reports, per-person delete
-- (supabase/migrations/20260806_message_images_and_safety.sql)
-- ===========================================================================

-- Photos in a conversation, and the three things you need to be able to do
-- about the person on the other end of one.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent: every
-- statement guards itself, so re-running it is safe.

-- ---------------------------------------------------------------------------
-- 1. A message can be a photo
-- ---------------------------------------------------------------------------
-- Half of what gets said between a buyer and a seller is "can I see the label",
-- "what does the sole look like", "here it is on". Without this the answer is a
-- link pasted into a text message, which is not an answer.
alter table public.messages add column if not exists image_url text;

-- Unsending, brought forward from the end of this file.
--
-- IT HAS TO BE HERE, and the reason is a real failure rather than tidiness. The
-- shape constraint below is dropped and re-added; re-adding it VALIDATES every
-- existing row. A soft-deleted message has kind = 'text' and body = NULL, which
-- the shape written below does not allow — so on any database where somebody
-- has ever unsent a message, a SECOND run of this file died on
--
--   ERROR: 23514: check constraint "messages_shape" of relation "messages"
--          is violated by some row
--
-- and took every section after it down with it. The column has to exist before
-- the constraint can mention it, so it is created here and the constraint below
-- allows for it from the start. (Repeated at the end of the file, where it
-- belongs narratively; `if not exists` makes the second one a no-op.)
alter table public.messages add column if not exists deleted_at timestamptz;

-- The kind and shape constraints are replaced rather than added to, because a
-- check constraint cannot be extended in place. Dropping first means this is
-- safe to run over the old schema or the new one.
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages drop constraint if exists messages_shape;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'offer', 'image'));

alter table public.messages
  add constraint messages_shape check (
    -- A deleted message keeps its `kind` — the conversation still knows a photo
    -- was there — but loses its body and its image.
    deleted_at is not null
    or (kind = 'text'  and body is not null and offer_cents is null)
    or (kind = 'offer' and offer_cents is not null and offer_status is not null)
    -- A caption is optional. A photo is not.
    or (kind = 'image' and image_url is not null and offer_cents is null)
  ) not valid;

-- `not valid` means: enforce this on every write from now on, but do not scan
-- the rows that are already here.
--
-- That is the correct trade for a file whose entire promise is that it can be
-- re-run. History cannot be fixed by refusing to add a constraint to it — the
-- malformed row is already stored, and aborting the migration leaves the ten
-- sections after this one unapplied to punish it. Every future insert and
-- update is checked exactly as it would be otherwise.
--
-- Sweep the old rows too, once you know they are clean:
--   alter table public.messages validate constraint messages_shape;
-- The query in the block below is what tells you whether they are.

do $$
declare
  bad int;
begin
  select count(*) into bad
    from public.messages
   where deleted_at is null
     and not (
       (kind = 'text'  and body is not null and offer_cents is null)
       or (kind = 'offer' and offer_cents is not null and offer_status is not null)
       or (kind = 'image' and image_url is not null and offer_cents is null)
     );

  if bad > 0 then
    raise notice '% message row(s) do not match the shape constraint. They are left alone and every new write is still checked; see messages_shape.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The bucket those attachments live in
-- ---------------------------------------------------------------------------
-- Private, unlike `listings`: a photo sent in a conversation is between two
-- people, and a public bucket would make it readable by anyone who ever saw the
-- URL. Reads go through signed URLs minted by the server for the two parties.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages',
  'messages',
  false,
  10485760, -- 10 MB; a phone photo compressed client-side is well under this
  -- NULL = no bucket-level type gate, and that is deliberate.
  --
  -- This used to be an image-only array, written when photographs were the only
  -- thing anyone could attach. Voice notes then failed with `mime type
  -- audio/webm is not supported` — refused by the BUCKET, before a line of app
  -- code ran, and unfixable by deploying anything. Adding the audio types would
  -- only move the same trap one attachment kind along, and the `do update`
  -- below means re-running this file re-imposes whatever is written here.
  --
  -- What the array actually checked was the content type the CLIENT declared,
  -- which is a label rather than a fact. Both message routes sniff the
  -- container's magic bytes and refuse anything that is not really the kind of
  -- file it claims to be — so the honest gate is in app code, and the bucket's
  -- one only ever caught honest files. Same reasoning, and the same NULL, as
  -- the buckets in complete_upload_system.sql.
  null
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Every object is filed under the sender's own id, so "is this yours" is a
-- prefix comparison rather than a join.
drop policy if exists "messages_upload_own" on storage.objects;
create policy "messages_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "messages_read_own" on storage.objects;
create policy "messages_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "messages_delete_own" on storage.objects;
create policy "messages_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. Blocking
-- ---------------------------------------------------------------------------
-- One row per direction. Blocking is not symmetric and must not be stored as
-- though it were: the person who blocked knows, the person blocked does not.
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- You can see, make and undo your own blocks, and nobody else's. Notably there
-- is no policy letting the blocked party read this table: a block they can look
-- up is a block that tells them they were blocked.
drop policy if exists "user_blocks_own_select" on public.user_blocks;
create policy "user_blocks_own_select" on public.user_blocks
  for select to authenticated using (auth.uid() = blocker_id);

drop policy if exists "user_blocks_own_insert" on public.user_blocks;
create policy "user_blocks_own_insert" on public.user_blocks
  for insert to authenticated with check (auth.uid() = blocker_id);

drop policy if exists "user_blocks_own_delete" on public.user_blocks;
create policy "user_blocks_own_delete" on public.user_blocks
  for delete to authenticated using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- 4. Reports
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid references auth.users(id) on delete set null,
  reason text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists conversation_reports_status_idx
  on public.conversation_reports (status, created_at desc);

alter table public.conversation_reports enable row level security;

-- A reporter may file one and may see their own. Nobody reads anyone else's
-- through this API — moderation runs on the service role.
drop policy if exists "conversation_reports_insert_own" on public.conversation_reports;
create policy "conversation_reports_insert_own" on public.conversation_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists "conversation_reports_select_own" on public.conversation_reports;
create policy "conversation_reports_select_own" on public.conversation_reports
  for select to authenticated using (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- 5. Leaving a conversation
-- ---------------------------------------------------------------------------
-- Deleting is per-person. A thread is shared, so one party pressing delete must
-- not reach into the other party's inbox and remove a conversation they are
-- still having — it hides it from the one who asked, and comes back for them
-- if the other person writes again.
alter table public.conversations add column if not exists buyer_deleted_at timestamptz;
alter table public.conversations add column if not exists seller_deleted_at timestamptz;

-- The existing update policy already restricts writes to the two parties, so no
-- new policy is needed — a party may set their own side's column, and the API
-- is what decides which one that is.


-- ===========================================================================
-- Foreign keys to the listings tables, added only if those tables exist
-- ===========================================================================
-- `listing_id` above is a plain uuid rather than an inline `references
-- public.products(id)`, and that is not a shortcut — it is the difference
-- between this file running and this file stopping on line 40.
--
-- An inline FK is evaluated the moment the CREATE TABLE is parsed, so on a
-- database without public.products the very first statement raises 42P01 and
-- nothing after it runs. Declaring the column first and attaching the
-- constraint here means the messaging schema installs on any database, and
-- picks up its referential integrity the moment the listings tables are there —
-- run this file again after them and the constraints appear.
--
-- Idempotent both ways: it does nothing if the table is missing, and nothing if
-- the constraint already exists.

do $$ begin
  if to_regclass('public.products') is null then
    raise notice 'public.products not found — conversations.listing_id left without a foreign key. Re-run this file once the listings schema exists.';
    return;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'conversations_listing_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_listing_id_fkey
      foreign key (listing_id) references public.products(id) on delete cascade;
  end if;

  if to_regclass('public.notifications') is not null
     and not exists (select 1 from pg_constraint where conname = 'notifications_listing_id_fkey') then
    alter table public.notifications
      add constraint notifications_listing_id_fkey
      foreign key (listing_id) references public.products(id) on delete cascade;
  end if;
end $$;


-- ===========================================================================
-- Realtime, and unsending a message
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Live messages
-- ---------------------------------------------------------------------------
-- Realtime only forwards rows from tables that are IN the publication, and by
-- default `messages` is not. Without this the client subscribes, the channel
-- reports itself connected, and no event ever arrives — a thread that looks
-- live and silently is not, which is worse than one that is honestly slow.
--
-- `add table` raises if the table is already published, so it is guarded rather
-- than wrapped in a begin/exception block: an error swallowed here would hide a
-- genuinely missing publication.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found — is Realtime enabled on this project?';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  -- Conversations too: `last_message_at` moving is what re-sorts the inbox, and
  -- it is the cheapest possible signal that something happened in a thread you
  -- do not currently have open.
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- What a subscriber is allowed to hear.
--
-- This is the part that is easy to get dangerously wrong. Realtime evaluates
-- RLS against the subscriber's own JWT, so `messages_select` — which already
-- says "only if you are a party to the parent conversation" — is what stops one
-- person's socket receiving another person's messages. It is enabled by
-- 20260802 and is asserted here rather than assumed, because a table published
-- to Realtime WITHOUT row-level security broadcasts every row to every
-- subscriber.
do $$ begin
  if to_regclass('public.messages') is not null then
    execute 'alter table public.messages enable row level security';
  end if;
  if to_regclass('public.conversations') is not null then
    execute 'alter table public.conversations enable row level security';
  end if;
end $$;

-- The filter the client subscribes with is `conversation_id=eq.<id>`, and
-- Realtime applies it server-side per row. This index is what keeps that cheap
-- and is almost certainly already here from 20260802.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);



-- ---------------------------------------------------------------------------
-- Unsending one message
-- ---------------------------------------------------------------------------
-- Soft, not hard. A row that simply disappears leaves the other person looking
-- at a gap where something used to be, with no way to tell whether they
-- misremembered it — so it becomes "Mesaj șters", which is both honest and what
-- every chat app does. It also keeps the day dividers and message grouping
-- intact, which a vanished row would otherwise reshuffle.
alter table public.messages add column if not exists deleted_at timestamptz;

-- The shape constraint has to allow an emptied row. A deleted message keeps its
-- `kind` — the conversation still knows a photo was there — but loses its body
-- and its image, and both of those are `not null` for their kind under the
-- constraint written above. Without this, the delete fails with a check
-- violation and the message stays on screen.
--
-- Already spelled exactly this way further up, where the column is created. It
-- is repeated rather than removed because this is where the rule belongs in the
-- story of the file, and re-adding an identical constraint costs one statement.
-- `not valid` for the same reason it is up there: a re-run must not abort on a
-- row that predates the rule.
alter table public.messages drop constraint if exists messages_shape;
alter table public.messages
  add constraint messages_shape check (
    deleted_at is not null
    or (kind = 'text'  and body is not null and offer_cents is null)
    or (kind = 'offer' and offer_cents is not null and offer_status is not null)
    or (kind = 'image' and image_url is not null and offer_cents is null)
  ) not valid;

-- No new RLS policy, deliberately. `messages_update` requires
-- `sender_id <> auth.uid()` — it exists so the OTHER party can mark things read
-- and answer offers — so an author editing their own row is exactly the case it
-- forbids. Rather than widen it and hand every client a way to rewrite its own
-- history, the delete endpoint proves ownership through the caller's client and
-- then writes this one field with the service role.



-- ===========================================================================
-- Following, and who is online
-- ===========================================================================
-- Not messaging, but in this file for the same reason everything else is: the
-- Follow button on a member page cannot work if `public.follows` does not
-- exist, and the symptom — a button that does nothing — looks like a bug in the
-- button rather than a table that was never created.

-- (supabase/migrations/20260731_follows.sql)

-- ============================================================================
-- storelib — the follow graph
--
-- Backs the Following tab in the mobile feed and the Follow control on each
-- listing. Safe to run more than once.
--
-- A follow points at a PROFILE (which is an auth user), not at a creator row.
-- Sellers are reached through creators, but a person is the thing you follow —
-- that way the People results in search can use exactly the same button, and a
-- seller who later gains or changes a creator row keeps their followers.
-- ============================================================================

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Following yourself is never meaningful and would pollute follower counts.
  constraint follows_no_self check (follower_id <> following_id),
  -- Makes a follow idempotent: the API can upsert without racing itself when a
  -- button is double-tapped.
  constraint follows_unique unique (follower_id, following_id)
);

-- "Who do I follow" (the Following feed, and hydrating button state).
create index if not exists idx_follows_follower_id on public.follows (follower_id);
-- "How many follow them" (follower counts on a profile).
create index if not exists idx_follows_following_id on public.follows (following_id);

alter table public.follows enable row level security;

-- The graph is public, the same way follower counts are public on any
-- marketplace: anyone may read it, but you may only ever add or remove your own
-- follows. follower_id is never taken from the request body.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows for select
  using (true);

drop policy if exists "users insert their own follows" on public.follows;
create policy "users insert their own follows"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "users delete their own follows" on public.follows;
create policy "users delete their own follows"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- (supabase/migrations/20260731_presence.sql)

-- ============================================================================
-- storelib — last-seen presence
--
-- Backs the online/offline dot on the Following list. Deliberately a single
-- timestamp rather than a realtime presence channel: the dot only needs to say
-- "around recently", and a column costs nothing to read alongside the profile
-- rows we already fetch. Safe to run more than once.
-- ============================================================================

-- Guarded, like every other reference to public.profiles in this file. The
-- header promises no prerequisites and this was the one statement that would
-- still have stopped the script on a database without a profiles table.
do $$ begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles not found — presence skipped. Re-run this file once profiles exists.';
    return;
  end if;

  alter table public.profiles add column if not exists last_seen_at timestamptz;

  -- Read as part of "who do I follow", so it's worth an index once follow lists
  -- get long enough to sort or filter on.
  create index if not exists idx_profiles_last_seen_at
    on public.profiles (last_seen_at desc nulls last);
end $$;


-- ===========================================================================
-- Abuse limits, enforced where they cannot be gone around
-- ===========================================================================
-- The API already rate-limits sending, and that is the layer that produces a
-- decent error message, so it stays. This is the layer underneath it.
--
-- The reason both are needed: Supabase publishes PostgREST, so anyone holding a
-- valid session token can insert into public.messages directly with curl. Every
-- rule that lives only in app/api/messages/**/route.ts is a rule that applies
-- to the app and to nobody else — which is exactly the position a spammer wants
-- to be in. RLS says WHO may write; these triggers say HOW MUCH and TO WHOM,
-- and they run inside the transaction on every path into the table.
--
-- What is deliberately NOT here: anything about the content of a message. Word
-- lists age badly, they are trivially defeated by a space, and they misfire on
-- the languages this app is actually used in. Volume and consent are the two
-- things a database can judge correctly, so they are the two things it judges.
-- ---------------------------------------------------------------------------

-- 1. Volume.
--
-- The window is the last minute, counted from the sender's own rows in this
-- conversation and across all of them. Two limits rather than one because they
-- catch different things: 20/min in one thread is somebody hammering a single
-- seller, 60/min overall is somebody working through a list of them.
--
-- Generous on purpose. A real argument between a buyer and a seller can run at
-- fifteen messages a minute and must not hit a wall; the numbers are set where
-- only automation reaches them.
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  in_thread int;
  overall   int;
begin
  select count(*) into in_thread
    from public.messages
   where sender_id = new.sender_id
     and conversation_id = new.conversation_id
     and created_at > now() - interval '1 minute';

  if in_thread >= 20 then
    raise exception 'rate_limited: too many messages in this conversation'
      using errcode = '53400';
  end if;

  select count(*) into overall
    from public.messages
   where sender_id = new.sender_id
     and created_at > now() - interval '1 minute';

  if overall >= 60 then
    raise exception 'rate_limited: too many messages'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit_trg on public.messages;
create trigger messages_rate_limit_trg
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- The index that makes the two counts above cheap. Without it every insert
-- scans the sender's whole history, and the rate limiter becomes the slowest
-- thing about sending a message.
create index if not exists messages_sender_recent_idx
  on public.messages (sender_id, created_at desc);

-- 2. Consent.
--
-- A block currently stops the app from delivering, and the app is not the only
-- way in. This closes it at the table: if either party has blocked the other,
-- neither can write to the thread.
--
-- Both directions, and that is the point. Blocking someone must stop them
-- reaching you — but it must also stop YOU writing to them, or "block" becomes
-- a one-way mute that still lets the blocker harass. Every large platform
-- treats a block as severing the channel, not muting one end of it.
create or replace function public.messages_respect_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
    into other
    from public.conversations c
   where c.id = new.conversation_id;

  if other is null then
    return new; -- no counterparty to consider; membership is RLS's business
  end if;

  if exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = new.sender_id and b.blocked_id = other)
        or (b.blocker_id = other and b.blocked_id = new.sender_id)
  ) then
    -- Deliberately vague. "You are blocked" tells the sender something the
    -- person who blocked them chose not to tell them.
    raise exception 'blocked: message not delivered' using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_respect_blocks_trg on public.messages;
create trigger messages_respect_blocks_trg
  before insert on public.messages
  for each row execute function public.messages_respect_blocks();

-- 3. Size.
--
-- A body cap so a single insert cannot be a megabyte of text. 4000 characters
-- is far past any real message and far below anything worth storing by
-- accident. Applied as a constraint rather than a trigger because it is a fact
-- about the column, and it is checked on updates too.
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages
  add constraint messages_body_length
  check (body is null or char_length(body) <= 4000) not valid;
-- `not valid` so the statement cannot fail on history that predates the rule;
-- everything written from now on is checked. Validate it later if you want the
-- old rows swept too:
--   alter table public.messages validate constraint messages_body_length;

-- 4. Reports, rate-limited the same way.
--
-- Report is a button anyone can press about anyone, which makes it a way to
-- flood the moderation queue if it is not bounded. One report per person per
-- conversation is the rule; pressing it again updates nothing and errors
-- nothing the user needs to see.
--
-- ---------------------------------------------------------------------------
-- REPORTING ONE MESSAGE, not just the thread
-- ---------------------------------------------------------------------------
-- A report used to be about a conversation. That is the right unit for "this
-- person is a scammer" and the wrong one for "this specific message asked me
-- for my card number" — which is the one moderation can act on without reading
-- a hundred rows to find what was meant. `message_id` is nullable because both
-- remain true reports: the details sheet still reports the thread, and the menu
-- on a bubble reports that bubble.
--
-- `on delete set null` rather than cascade, deliberately. A message that has
-- been deleted is very often the reason somebody is reporting it, and a report
-- that vanishes when the offender presses "unsend" is a moderation queue the
-- offender controls. The report survives; it simply loses its pointer.
alter table public.conversation_reports
  add column if not exists message_id uuid references public.messages(id) on delete set null;

-- The one-per-reporter rule, split so that per-message reports are not blocked
-- by a thread-level one somebody filed months ago — and so that a hundred
-- reports on a hundred messages is still one report per message.
--
-- Dropped and recreated as PARTIAL: the old unconditional index would refuse a
-- second row for the same (conversation, reporter) whatever its message_id was,
-- which would make the per-message report silently a no-op for anybody who has
-- ever reported that thread. Both new indexes are `if not exists`, so a rerun
-- of this file after the first one is still a no-op.
drop index if exists conversation_reports_one_per_reporter;

create unique index if not exists conversation_reports_one_per_thread
  on public.conversation_reports (conversation_id, reporter_id)
  where message_id is null;

create unique index if not exists conversation_reports_one_per_message
  on public.conversation_reports (reporter_id, message_id)
  where message_id is not null;

create index if not exists conversation_reports_message_idx
  on public.conversation_reports (message_id)
  where message_id is not null;


-- ===========================================================================
-- What actually ran — every number here should be as commented
-- ===========================================================================
select
  to_regclass('public.products')             as products,               -- not null
  to_regclass('public.conversations')        as conversations,          -- not null
  to_regclass('public.messages')             as messages,               -- not null
  to_regclass('public.notifications')        as notifications,          -- not null
  to_regclass('public.user_blocks')          as user_blocks,            -- not null
  to_regclass('public.conversation_reports') as conversation_reports,   -- not null
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages', 'conversations'))                   as realtime_tables,   -- 2
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations'
      and column_name in ('buyer_deleted_at', 'seller_deleted_at'))     as delete_columns,    -- 2
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'messages'
      and column_name in ('image_url', 'deleted_at'))                   as message_columns,   -- 2
  (select count(*) from storage.buckets where id = 'messages')          as messages_bucket,   -- 1
  (select count(*) from pg_trigger
    where tgrelid = 'public.messages'::regclass and not tgisinternal
      and tgname in ('messages_rate_limit_trg', 'messages_respect_blocks_trg'))
                                                                        as abuse_triggers,    -- 2
  to_regclass('public.follows')              as follows,                -- not null
  to_regclass('public.wishlist_items')       as wishlist_items;         -- not null



-- ###########################################################################
--  SECTION  5: Profile bio and cover
--  source: supabase/sql/RUN_PROFILE_COVER_BIO.sql
-- ###########################################################################

-- ===========================================================================
--  Storelib — profile covers and bios
-- ===========================================================================
--  Run this once in the Supabase SQL editor. It is idempotent: running it a
--  second time changes nothing and raises nothing.
--
--  What it adds
--  ------------
--    profiles.bio        the line under your name on your profile
--    profiles.cover_url  the band of colour or photograph behind it
--
--  Until this has run, the profile still works: /api/profile answers 409 with
--  `missingColumns` and the editor says so plainly rather than failing, and
--  every profile shows the preset cover its account id resolves to. See
--  lib/profile/covers.ts.
-- ===========================================================================

-- ── The columns ────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists cover_url text;

comment on column public.profiles.bio is
  'Free text shown under the display name on the profile. Capped at 240 characters by the application.';

comment on column public.profiles.cover_url is
  'NULL = the preset chosen from the account id; "preset:<id>" = a preset picked deliberately; an https URL = an uploaded image. See lib/profile/covers.ts.';

-- ── A ceiling the database keeps too ───────────────────────────────────────
--  The API trims to 240 before writing, and PostgREST is reachable without
--  going through the API at all — so the app's limit is not the last word. A
--  check constraint is: it costs nothing on every write and it cannot be
--  bypassed by anything holding a session token.
--
--  Written as a DO block because `add constraint if not exists` does not exist
--  for check constraints, and a plain ALTER would fail on the second run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_bio_length'
  ) then
    alter table public.profiles
      add constraint profiles_bio_length check (bio is null or char_length(bio) <= 400);
  end if;
end $$;

--  400 rather than 240 on purpose. The application's limit is a product
--  decision that may move; this one is an abuse ceiling, and a constraint that
--  sits exactly on the app's limit turns every future copy change into a
--  migration.

-- ── Who may write them ─────────────────────────────────────────────────────
--  Nothing to add if `profiles` already has an owner-scoped update policy,
--  which it does — these are two more columns on a row the owner could already
--  update. Stated here so the next person reading this file does not go looking
--  for a policy that is deliberately absent.
--
--  Reads are likewise unchanged: a profile is public, and a bio and a cover are
--  the two most public things on it.

-- ── The storage the uploads land in ────────────────────────────────────────
--  Covers are written by the service role into the existing public `avatars`
--  bucket under `covers/<user-id>/<timestamp>.<ext>` — see
--  app/api/profile/cover/route.ts. No new bucket and no new policy: the upload
--  never touches storage RLS, because the route proves who the caller is before
--  a single byte is stored, and the object is public afterwards because the
--  page that shows it is.
--
--  If the `avatars` bucket does not exist on this project yet, create it as a
--  PUBLIC bucket:
--
--    insert into storage.buckets (id, name, public)
--    values ('avatars', 'avatars', true)
--    on conflict (id) do nothing;

-- ── Tell PostgREST the table changed ──────────────────────────────────────
--  This line is not optional, and leaving it out is a very confusing five
--  minutes. PostgREST answers the API from its OWN cached picture of the
--  schema, and it validates every request against that cache before Postgres is
--  asked anything. A column added by the statements above therefore does not
--  exist as far as the API is concerned until the cache reloads — so a save
--  comes back with
--
--    Could not find the 'bio' column of 'profiles' in the schema cache
--
--  over a column that is demonstrably there in the SQL editor. The cache
--  refreshes on its own eventually; this asks it to do so now.
notify pgrst, 'reload schema';

select 'profiles.bio and profiles.cover_url are ready' as result;



-- ###########################################################################
--  SECTION  6: Chat push
--  source: supabase/sql/RUN_MESSAGE_PUSH.sql
-- ###########################################################################

-- ===========================================================================
--  Storelib — push notifications for chat messages
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: running it again changes
--  nothing and raises nothing.
--
--  Until this has run, chat pushes DEGRADE rather than break:
--    · the idempotency table is missing, so the code falls back to sending
--      (a duplicate is a worse failure than a missing one, but only just —
--       see lib/push/message-notification.ts, which logs it loudly)
--    · the two preference columns are missing, so everyone is treated as
--      opted in with previews on, which is the default anyway
--  Nothing here is required for a message to SEND.
-- ===========================================================================

-- ── 1. Idempotency ─────────────────────────────────────────────────────────
--  One row per message that has been through push processing. The primary key
--  is the whole mechanism: `insert … on conflict do nothing` returning zero
--  rows means somebody else got there first, and Postgres decides that under
--  concurrency rather than us.
--
--  This is why there is no in-memory dedupe anywhere in this feature. Vercel
--  functions do not share memory, so a module-level Set is a dedupe that works
--  perfectly on one instance and not at all across two — which is the shape of
--  bug that only appears under load, i.e. exactly when it matters.
create table if not exists public.message_push_log (
  message_id    uuid        primary key,
  recipient_id  uuid        not null,
  created_at    timestamptz not null default now()
);

comment on table public.message_push_log is
  'One row per message already considered for a push. The primary key IS the idempotency key — see lib/push/message-notification.ts.';

--  Housekeeping. This table only answers "have we already handled this
--  message", and that question has no meaning after a few minutes: a retry
--  that arrives a day later is not a retry. Kept for a week so the window is
--  generous, and indexed so the delete can find its rows.
create index if not exists message_push_log_created_at_idx
  on public.message_push_log (created_at);

--  Nobody reads this table through the API — only the service role writes it,
--  from the server. RLS on with no policy means exactly that: the service role
--  bypasses it, everyone else sees nothing.
alter table public.message_push_log enable row level security;

-- ── 2. Notification preferences ────────────────────────────────────────────
--  On `profiles` rather than in a table of their own, deliberately. There are
--  two booleans; a preferences table would be a join on every push and a
--  migration for every new switch, and this project already reads `profiles`
--  on the push path to get the sender's name.
--
--  Both default TRUE. A column added to a table with existing rows fills them
--  with the default, so nobody is silently opted out by this migration.
alter table public.profiles add column if not exists push_messages_enabled boolean not null default true;
alter table public.profiles add column if not exists push_preview_enabled  boolean not null default true;

comment on column public.profiles.push_messages_enabled is
  'False silences chat push entirely for this account. Sale and payout notifications are unaffected.';
comment on column public.profiles.push_preview_enabled is
  'False sends the notification without the message text: "Storelib — Ai un mesaj nou".';

-- ── 3. What the aggregation is counted from ────────────────────────────────
--  Nothing to create. "N mesaje noi" is
--
--    select count(*) from messages
--     where conversation_id = $1 and sender_id <> $2 and read_at is null
--
--  which is the same source of truth the unread badge and the inbox already
--  use. There is no counter to drift, and the number is recalculable at any
--  moment from the messages themselves.
--
--  The index that makes it cheap should already exist from the messaging
--  migration; created here if not.
create index if not exists messages_conversation_unread_idx
  on public.messages (conversation_id, read_at)
  where read_at is null;

-- ── Tell PostgREST the table changed ──────────────────────────────────────
--  Not optional. PostgREST validates against its own cached schema before
--  Postgres is asked anything, so a column added above does not exist as far
--  as the API is concerned until this runs.
notify pgrst, 'reload schema';

select 'message push: log table, preference columns and unread index are ready' as result;



-- ###########################################################################
--  SECTION  7: Likes, follows and trending push
--  source: supabase/sql/RUN_ACTIVITY_PUSH.sql
-- ###########################################################################

-- ===========================================================================
--  Storelib — social activity notifications (likes, follows, trending)
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: running it again changes
--  nothing and raises nothing.
--
--  Run AFTER supabase/sql/RUN_MESSAGING_ALL.sql (this widens a constraint that
--  file creates) and after supabase/sql/RUN_MESSAGE_PUSH.sql (this reuses the
--  push_preview_enabled column that file adds).
--
--  Until this has run, social activity notifications are simply OFF — the code
--  logs one line saying the table is missing and every like and follow works
--  exactly as it does today. Nothing here is required for anything else.
--
--  Note the asymmetry with chat push, which degrades by SENDING. This degrades
--  by staying quiet, because the failure mode of guessing on this path is a
--  phone that buzzes for every heart — which is the whole thing the feature
--  exists to prevent. See lib/push/activity-db.ts.
-- ===========================================================================

-- ── 1. The queue ───────────────────────────────────────────────────────────
--  Social events are written here as they happen and sent as a BATCH by
--  /api/cron/activity-digest. Nothing is pushed at the moment of the like.
--
--  `dedupe_key` is the anti-abuse mechanism and the reason this table has a
--  unique constraint rather than just a primary key. It is
--
--      like:<listing>:<actor>            — one notification per person per listing, ever
--      follow:<recipient>:<actor>        — one per person per person, ever
--      trending:<listing>:<YYYY-MM-DD>   — at most one per listing per day
--
--  Note what is NOT in the first two: a timestamp. A key containing the time
--  would let somebody generate unlimited notifications by tapping a heart on
--  and off, which is the cheapest possible way to harass a seller.
--
--  `notified_at` doubles as the CLAIM. The digest runs
--  `update … set notified_at = now() where id in (…) and notified_at is null
--   returning *`, so two cron instances racing resolve in Postgres and the rows
--  are won exactly once. There is no in-memory dedupe anywhere in this feature:
--  Vercel functions do not share memory, so a module-level Set is a mechanism
--  that works on one instance and not across two.
create table if not exists public.activity_push_queue (
  id           uuid        primary key default gen_random_uuid(),
  recipient_id uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('like', 'follow', 'trending')),
  actor_id     uuid        references auth.users(id) on delete cascade,
  listing_id   uuid,
  dedupe_key   text        not null unique,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

comment on table public.activity_push_queue is
  'Batched social activity events. dedupe_key IS the "notify once" mechanism; notified_at IS the claim. See lib/push/activity-notification.ts.';

--  The digest's only two reads: "who has something pending" and "what is
--  pending for this person". Partial, because a sent row never matters to
--  either question again.
create index if not exists activity_push_queue_pending_idx
  on public.activity_push_queue (recipient_id, created_at)
  where notified_at is null;

--  Housekeeping needs to find old rows by age regardless of state.
create index if not exists activity_push_queue_created_at_idx
  on public.activity_push_queue (created_at);

--  Nobody reads this through the API — only the service role, from the server.
--  RLS on with no policy means exactly that.
alter table public.activity_push_queue enable row level security;

-- ── 2. Preference and rate-limit columns ───────────────────────────────────
--  push_activity_enabled is a THIRD switch, separate from push_messages_enabled
--  on purpose: "stop telling me about likes" and "stop telling me about
--  messages" are different requests, and a single switch would make the person
--  who wants the first give up the second.
--
--  push_preview_enabled is deliberately SHARED with chat rather than duplicated.
--  It means one thing — "do not put names and content on my lock screen" — and
--  two switches spelling the same sentence is two switches to get out of step.
alter table public.profiles
  add column if not exists push_activity_enabled boolean not null default true;

--  The four-hour floor between digests, held in the database because serverless
--  instances cannot share a timestamp any more than they can share a Set.
alter table public.profiles
  add column if not exists activity_push_last_at timestamptz;

comment on column public.profiles.push_activity_enabled is
  'False silences likes, follows and trending. Chat, sale and payout notifications are unaffected.';
comment on column public.profiles.activity_push_last_at is
  'When the last activity digest was sent. The rate limit (MIN_GAP_MS in lib/push/activity-notification.ts) reads this.';

-- ── 3. The in-app feed learns two words ────────────────────────────────────
--  The push is a summary; the notifications tab is where the detail lives, and
--  it is where a tapped digest lands. So a like and a trending listing need to
--  be expressible as feed rows, which means widening the CHECK constraint that
--  RUN_MESSAGING_ALL.sql created.
--
--  Guarded, so this file is safe on a database where the constraint was already
--  widened or was never created under that name.
do $$
begin
  if to_regclass('public.notifications') is not null then
    if exists (select 1 from pg_constraint where conname = 'notifications_kind_check') then
      alter table public.notifications drop constraint notifications_kind_check;
    end if;
    alter table public.notifications
      add constraint notifications_kind_check
      check (kind in ('follow', 'offer_received', 'offer_accepted', 'offer_declined',
                      'message', 'like', 'trending'));
  end if;
end $$;

-- ── 4. Trending is counted, not stored ─────────────────────────────────────
--  A listing is "trending" when it collected TREND_MIN_SAVES wishlist saves in
--  the last 24 hours (lib/push/activity-db.ts). There is no counter column and
--  nothing to reset at midnight: the number is recomputed from wishlist_items
--  every run, and the once-per-day guarantee comes from the dedupe key above.
--
--  The index that makes that scan cheap.
create index if not exists wishlist_items_created_at_idx
  on public.wishlist_items (created_at desc);

-- ── 5. Housekeeping ────────────────────────────────────────────────────────
--  Rows are kept for 30 days AFTER being sent, not deleted on send — because
--  the dedupe key only prevents a repeat while the row exists, and a like that
--  can be re-notified an hour later is not deduplicated at all. Thirty days is
--  the window in which re-liking is a person, not an accident.
--
--  This is a statement to run occasionally, not a trigger. Paste it into the
--  SQL editor whenever, or attach it to pg_cron if that extension is enabled:
--
--    delete from public.activity_push_queue
--     where notified_at is not null and notified_at < now() - interval '30 days';

-- ── Tell PostgREST the schema changed ──────────────────────────────────────
--  Not optional. PostgREST validates against its own cached schema before
--  Postgres is asked anything, so the table and columns above do not exist as
--  far as the API is concerned until this runs.
notify pgrst, 'reload schema';

select 'social activity push: queue, preference columns, feed kinds and indexes are ready' as result;



-- ###########################################################################
--  SECTION  8: Optimised image variants
--  source: supabase/sql/RUN_LISTING_IMAGE_VARIANTS.sql
-- ###########################################################################

-- ===========================================================================
--  Storelib — two image variants per listing photo
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent.
--
--  ADDITIVE ON PURPOSE. `thumbnail_url` and `gallery_urls` keep their exact
--  meaning and keep pointing at working images — about a dozen places read
--  them (cards, detail, search, inbox, chat previews, sitemap, OG tags) and
--  replacing them would mean every one of those reads changing on the same
--  deploy as the write. Anything missed is a broken image on a live
--  marketplace.
--
--  So this adds a column beside them. Nothing reads it until it is populated,
--  everything falls back when it is not, and listings created before today
--  keep working untouched until the backfill reaches them. That is what
--  "never delete an original until the optimised version is verified"
--  requires in practice.
-- ===========================================================================

-- ── The variants ───────────────────────────────────────────────────────────
--  A jsonb ARRAY, positionally aligned with [thumbnail_url, ...gallery_urls]
--  so index 0 is always the cover. Each element:
--
--    {
--      "large":       "https://…/object/public/listings/<uid>/<id>-large.webp",
--      "thumb":       "https://…/object/public/listings/<uid>/<id>-thumb.webp",
--      "width": 1280, "height": 1600,
--      "thumbWidth": 800, "thumbHeight": 1000,
--      "focal": { "x": 0.5, "y": 0.42 }
--    }
--
--  jsonb rather than a child table: this is read on every card render, always
--  in full, always with its product, and never queried across products. A join
--  per card to reassemble something that is always used whole is a join that
--  buys nothing. If image-level querying is ever needed, that is the moment to
--  promote it to a table — not before.
--
--  `thumb` may be null. That is a photo whose browser could not re-encode it;
--  the card falls back to `large`, and the backfill fills it in later.
alter table public.products
  add column if not exists image_variants jsonb not null default '[]'::jsonb;

comment on column public.products.image_variants is
  'Per-photo optimised pair, positionally aligned with [thumbnail_url, ...gallery_urls]. See lib/images/variants.ts. Additive: thumbnail_url remains the fallback and is never removed.';

-- ── Finding the listings the backfill still has to do ──────────────────────
--  Partial, because a listing that already has variants is of no interest to
--  the only query that reads this — "what is left" — and the index should not
--  carry the whole table to answer it.
create index if not exists products_needs_image_variants_idx
  on public.products (created_at)
  where image_variants = '[]'::jsonb;

-- ── Tell PostgREST the column exists ──────────────────────────────────────
--  Not optional. PostgREST validates against its own cached schema before
--  Postgres is asked anything, so until this runs the column does not exist as
--  far as the API is concerned and every write of it fails with
--  "Could not find the 'image_variants' column of 'products' in the schema
--  cache" over a column that is demonstrably there.
notify pgrst, 'reload schema';

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'image_variants'
  ) as image_variants_ready,
  (select count(*) from public.products where image_variants = '[]'::jsonb) as listings_awaiting_backfill;



-- ###########################################################################
--  SECTION  9: One buyer at a time
--  source: supabase/sql/RUN_RESERVATIONS.sql
-- ###########################################################################

-- ===========================================================================
--  ONE BUYER AT A TIME
-- ===========================================================================
--
--  WHAT THIS FIXES
--  A listing is one physical object. Two people reaching the pay button in the
--  same second both had their card charged: the guard that refuses a
--  second sale READS the orders table, and neither order exists yet at the
--  moment the other one checks. Two charges, one jacket, one refund and an
--  apology.
--
--  A read-then-write cannot fix that. Something has to make Postgres pick.
--
--  HOW IT WORKS
--  A primary key on product_id, so the table can hold AT MOST ONE live
--  reservation per listing. Claiming is one INSERT … ON CONFLICT, which is
--  atomic: of two requests arriving together, exactly one comes back holding
--  the row and the other comes back empty. No advisory locks, no polling, no
--  second source of truth about who is buying what.
--
--  Reservations expire on their own — see the function — so an abandoned
--  checkout frees the listing after fifteen minutes with nothing to sweep.
--
--  SAFE TO RUN MORE THAN ONCE. Everything here is create-if-not-exists or
--  create-or-replace.
--
--  UNTIL IT IS RUN, nothing breaks: lib/marketplace/reservation.ts treats a
--  missing function as "could not reserve, carry on", so checkout behaves
--  exactly as it does today and the race stays open until you run this.
-- ===========================================================================

create table if not exists public.product_reservations (
  -- THE WHOLE MECHANISM. One row per listing, enforced by Postgres.
  product_id uuid primary key references public.products(id) on delete cascade,
  -- A signed-in buyer's user id, or the PaymentIntent id for a guest. Only ever
  -- compared for equality, so a buyer refreshing the checkout re-takes their
  -- own reservation instead of colliding with it.
  buyer_key text not null,
  payment_intent_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Expiry is looked up on every claim.
create index if not exists product_reservations_expires_idx
  on public.product_reservations (expires_at);

-- Server-only. There is nothing here a browser should read: it would say which
-- listings somebody is midway through buying, which is neither useful nor
-- anybody's business. RLS on with no policies means the service role is the
-- only way in, which is the same shape as buyer_shipping_prefs.
alter table public.product_reservations enable row level security;

-- ---------------------------------------------------------------------------
--  THE CLAIM
-- ---------------------------------------------------------------------------
--  Returns true if the caller now holds the listing, false if somebody else
--  does. One statement, so the decision is Postgres's and not the caller's.
--
--  The ON CONFLICT branch takes the row when — and only when — the existing
--  reservation has expired, or it already belongs to this same buyer. That
--  second case matters: a buyer who reloads the checkout, or whose first
--  PaymentIntent failed, must be able to carry on rather than be locked out by
--  their own abandoned attempt.
create or replace function public.claim_product_reservation(
  p_product_id uuid,
  p_buyer_key text,
  p_intent text default null,
  p_minutes int default 15
) returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.product_reservations (product_id, buyer_key, payment_intent_id, expires_at)
  values (p_product_id, p_buyer_key, p_intent, now() + make_interval(mins => greatest(1, p_minutes)))
  on conflict (product_id) do update
    set buyer_key = excluded.buyer_key,
        payment_intent_id = excluded.payment_intent_id,
        expires_at = excluded.expires_at,
        created_at = now()
    where product_reservations.expires_at < now()
       or product_reservations.buyer_key = excluded.buyer_key
  returning true;
$$;

-- ---------------------------------------------------------------------------
--  THE RELEASE
-- ---------------------------------------------------------------------------
--  Called when the sale completes (the listing is marked sold, so the row is
--  just clutter) and when a payment fails (so the next person can buy it
--  without waiting out the fifteen minutes).
--
--  Scoped to the holder: a request cannot release somebody else's claim, which
--  would otherwise be a one-line way to snipe an item out from under whoever is
--  paying for it.
create or replace function public.release_product_reservation(
  p_product_id uuid,
  p_buyer_key text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.product_reservations
   where product_id = p_product_id
     and buyer_key = p_buyer_key;
$$;

revoke all on function public.claim_product_reservation(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.release_product_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_product_reservation(uuid, text, text, int) to service_role;
grant execute on function public.release_product_reservation(uuid, text) to service_role;

-- Did it work?
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'product_reservations') as table_present,
  (select count(*) from pg_proc where proname = 'claim_product_reservation') as claim_present,
  (select count(*) from pg_proc where proname = 'release_product_reservation') as release_present;

notify pgrst, 'reload schema';



-- ###########################################################################
--  SECTION 10: Shipping and AWB
--  source: supabase/sql/RUN_SHIPPING.sql
-- ###########################################################################

-- ===========================================================================
--  SHIPPING / AWB — additive columns on public.orders
-- ===========================================================================
--  Run this in the Supabase SQL editor. Safe to run more than once.
--
--  ADDITIVE ONLY. Nothing existing is renamed, moved or dropped: every column
--  below is new and nullable, so an order that predates shipping reads exactly
--  as it did and every existing query keeps working untouched.
--
--  WHY THESE COLUMNS AND NOT OTHERS
--  `orders` already carries buyer_first_name, buyer_last_name and buyer_email —
--  those are NOT duplicated here. What it has never carried is where the parcel
--  goes: a marketplace that only sold digital products never needed a street.
--  So the delivery address is the genuinely new information, and the AWB fields
--  are the courier's answer to it.
-- ===========================================================================

-- ── Where the parcel goes ──────────────────────────────────────────────────
-- Captured at checkout, from the buyer. Kept on the ORDER rather than on the
-- profile because an address is a fact about one delivery: people move, and
-- send things to work, and to their mother. An order must always be able to say
-- where it actually went.
alter table public.orders
  add column if not exists ship_contact      text,
  add column if not exists ship_phone        text,
  add column if not exists ship_country_code text default 'RO',
  add column if not exists ship_county       text,
  add column if not exists ship_locality     text,
  add column if not exists ship_street       text,
  add column if not exists ship_street_no    text,
  add column if not exists ship_details      text,
  add column if not exists ship_postal_code  text,
  -- Locker deliveries: the courier's pickup-point id, when the buyer chose one
  -- instead of a street.
  add column if not exists ship_fixed_location_id integer,
  -- 'locker' | 'home'. The presence of THIS, not of the locker id, is what
  -- means "a delivery address has been chosen" — a home delivery legitimately
  -- has no locker id, so testing that column would report every home order as
  -- still needing an address, forever.
  add column if not exists ship_mode text;

-- ── What the courier gave back ─────────────────────────────────────────────
alter table public.orders
  add column if not exists shipping_status        text,
  add column if not exists shipping_provider      text,
  add column if not exists awb_number             text,
  add column if not exists tracking_number        text,
  add column if not exists shipping_label_url     text,
  add column if not exists shipping_carrier       text,
  add column if not exists shipping_service_id    integer,
  add column if not exists shipping_carrier_id    integer,
  add column if not exists shipping_provider_order_id text,
  add column if not exists shipping_cost_cents    integer,
  add column if not exists shipping_created_at    timestamptz,
  add column if not exists shipped_at             timestamptz,
  add column if not exists delivered_at           timestamptz,
  add column if not exists shipping_last_checked_at timestamptz,
  -- The carrier's own words, kept verbatim. Our status vocabulary is a mapping
  -- and mappings are wrong sometimes; without the original there is nothing to
  -- check the mapping against when a shipment behaves oddly.
  add column if not exists shipping_raw_status    text,
  add column if not exists shipping_error         text;

-- Backfill: orders written before `ship_mode` existed carry a locker id and no
-- mode. Everything now asks "has a destination been chosen?" by testing the
-- mode, so without this those orders would read as having no address — and the
-- buyer's saved preference would overwrite the locker they already picked.
update public.orders
   set ship_mode = 'locker'
 where ship_mode is null
   and ship_fixed_location_id is not null;

-- The same for anything that has a street but no locker: that is a home
-- delivery, whatever it was called when it was written.
update public.orders
   set ship_mode = 'home'
 where ship_mode is null
   and ship_fixed_location_id is null
   and ship_street is not null
   and ship_locality is not null;

-- ── The idempotency guarantee, in the database ─────────────────────────────
--
-- THE MOST IMPORTANT LINE IN THIS FILE.
--
-- Creating an AWB books a real courier and charges the account, and the
-- provider has no idempotency key — the same POST twice is two shipments. The
-- application checks for an existing AWB before calling, and that check is a
-- read followed by a write, which two concurrent webhook retries can both pass.
--
-- A unique index cannot be raced. Two parallel attempts to attach an AWB to the
-- same order end with one row written and one error, instead of two couriers
-- arriving to collect the same jacket. Partial, so the many orders with no AWB
-- yet do not collide on null.
create unique index if not exists orders_awb_number_key
  on public.orders (awb_number)
  where awb_number is not null;

-- Finding the work: orders that are paid and have no AWB yet.
create index if not exists orders_awaiting_awb_idx
  on public.orders (created_at desc)
  where awb_number is null;

comment on column public.orders.shipping_status is
  'Marketplace shipping state: awaiting_shipment | awb_created | shipped | in_transit | delivered | shipping_creation_failed. See lib/shipping/status.ts.';
comment on column public.orders.shipping_raw_status is
  'The carrier''s own status string, unmapped. Kept so the mapping can be audited.';

-- ── The delivery point, chosen BEFORE paying ───────────────────────────────
--
-- Vinted asks where the parcel goes before taking the money, and so does
-- Storelib now. But the order does not exist yet at that moment — it is created
-- by the payment flow — so the choice has to live somewhere until there is an
-- order to attach it to. This is that somewhere.
--
-- KEYED BY BUYER, NOT BY ORDER, and deliberately: checkout allows guests, so
-- there may be no user id. A signed-in buyer is matched on user_id; a guest on
-- the email they typed at checkout. Both columns are on `orders` already, so
-- attaching the choice afterwards is a lookup, not a schema change to the
-- payment path — which is the point. Nothing in this feature edits how an order
-- is created.
--
-- It doubles as a remembered address: the second purchase skips the step.
create table if not exists public.buyer_shipping_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  -- The locker, and the network it is on. Both are needed: a locker→locker
  -- shipment requires both ends on one carrier.
  locker_id integer not null,
  carrier_id integer,
  contact text not null,
  phone text not null,
  -- Resolved server-side from the locker id, never taken from the client.
  country_code text default 'RO',
  county text,
  locality text,
  street text,
  street_no text,
  details text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- A buyer has one current delivery point, not a history.
  constraint buyer_shipping_prefs_identified check (user_id is not null or email is not null)
);

-- Home delivery as well as lockers. Written as ALTERs rather than folded into
-- the CREATE above so that a database where this file has ALREADY been run
-- picks the changes up too — `create table if not exists` would skip them
-- silently and leave the newer code querying columns that do not exist.
alter table public.buyer_shipping_prefs
  -- 'locker' → the parcel goes to a fixed location; 'home' → to a street
  -- address. Which one decides the courier SERVICE: the seller always drops off
  -- at a locker, so it is locker→locker (4) or locker→door (3).
  add column if not exists mode text not null default 'locker',
  add column if not exists postal_code text;

-- Home delivery has no locker id, so the column cannot stay NOT NULL. Guarded
-- because re-running this after the change would otherwise error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'buyer_shipping_prefs'
       and column_name = 'locker_id' and is_nullable = 'NO'
  ) then
    alter table public.buyer_shipping_prefs alter column locker_id drop not null;
  end if;
end $$;

-- Each mode has its own required fields. A row that claims to be a locker
-- delivery without a locker, or a home delivery without a street, is not a
-- delivery address at all — and it would fail at the courier, after payment.
alter table public.buyer_shipping_prefs
  drop constraint if exists buyer_shipping_prefs_mode_complete;
alter table public.buyer_shipping_prefs
  add constraint buyer_shipping_prefs_mode_complete check (
    (mode = 'locker' and locker_id is not null)
    or (mode = 'home' and street is not null and locality is not null and county is not null)
  );

-- One row per buyer, so saving is an upsert rather than an ever-growing log.
-- Partial, because the two identities are mutually exclusive in practice.
create unique index if not exists buyer_shipping_prefs_user_key
  on public.buyer_shipping_prefs (user_id) where user_id is not null;
create unique index if not exists buyer_shipping_prefs_email_key
  on public.buyer_shipping_prefs (lower(email)) where email is not null and user_id is null;

-- RLS on, and NO policies: this table is written and read only by the server
-- (service role), which is what lets a guest with no session have a row at all.
-- Without this, RLS-off would leave every buyer's phone number readable with
-- the anon key.
alter table public.buyer_shipping_prefs enable row level security;

comment on table public.buyer_shipping_prefs is
  'Where a buyer wants parcels delivered, chosen before payment. Server-only (service role); see app/api/shipping/preference.';

-- ── Did it work? ───────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name in ('awb_number','shipping_status','ship_locality')) as shipping_columns_present,
  (select count(*) from public.orders where awb_number is not null) as orders_with_awb,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'orders_awb_number_key') as idempotency_index_present,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'buyer_shipping_prefs') as prefs_table_present;

-- PostgREST answers from its own cached schema; without this the API keeps
-- reporting "Could not find the 'awb_number' column of 'orders'".
notify pgrst, 'reload schema';



-- ###########################################################################
--  SECTION 11: A profiles row for every account
--  source: supabase/sql/RUN_BACKFILL_PROFILES.sql
-- ###########################################################################

-- ===========================================================================
--  Storelib — give every account the profiles row it should already have
-- ===========================================================================
--  Run this once in the Supabase SQL editor. It is idempotent: accounts that
--  already have a row are left exactly as they are.
--
--  WHY THIS IS NEEDED
--  ------------------
--  A `profiles` row is normally written by a trigger on signup. Accounts made
--  before that trigger existed — or ones where it failed — have none, and
--  nothing in the app noticed, because every screen falls back to the auth user
--  for identity. The profile rendered a name and everything looked fine.
--
--  It stops looking fine the moment something tries to WRITE. `update ... where
--  id = :me` against a row that is not there is not an error: it matches zero
--  rows and reports success. So uploading a picture appeared to work and was
--  gone on the next load, and saving the profile — the one path that checks
--  whether a row actually changed — was the only thing that could tell you
--  anything was wrong.
--
--  The application creates the row itself now (see lib/profile/write.ts), so
--  this is a repair rather than a requirement. Run it and every account is
--  fixed at once, including the ones nobody has noticed yet.
--
--  WHAT IT DOES
--  ------------
--  Inserts one row per auth user that has none. The column list is built from
--  what this database actually has, because a `profiles` table with a NOT NULL
--  `username` and one without are both common and a fixed INSERT would fail on
--  one of them.
-- ===========================================================================

do $$
declare
  has_username boolean;
  has_email    boolean;
  cols text := 'id';
  vals text := 'u.id';
  made int;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
  ) into has_username;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) into has_email;

  -- A handle derived from the id, so it is unique without having to look at
  -- what anybody else has taken. People rename themselves from the app; this
  -- only has to be valid and not collide.
  if has_username then
    cols := cols || ', username';
    vals := vals || ', ''user'' || left(replace(u.id::text, ''-'', ''''), 12)';
  end if;

  if has_email then
    cols := cols || ', email';
    vals := vals || ', u.email';
  end if;

  execute format(
    'insert into public.profiles (%s)
     select %s
     from auth.users u
     left join public.profiles p on p.id = u.id
     where p.id is null
     on conflict (id) do nothing',
    cols, vals
  );

  get diagnostics made = row_count;
  raise notice 'profiles rows created: %', made;
end $$;

-- What is left, if anything. Zero is the answer you want.
select count(*) as accounts_still_without_a_profile
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;



-- ###########################################################################
--  DONE — the check. Every column should read true.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.conversations')          is not null as messaging,
  to_regclass('public.message_push_log')       is not null as chat_push,
  to_regclass('public.activity_push_queue')    is not null as activity_push,
  to_regclass('public.brands')                 is not null as brand_directory,
  to_regclass('public.product_reservations')   is not null as reservations,
  to_regclass('public.buyer_shipping_prefs')   is not null as shipping_prefs,
  (select count(*) from pg_proc
    where proname = 'claim_product_reservation')     = 1  as reservation_rpc,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='condition')                 as listing_condition,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='subcategory')               as listing_subcategory,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='draft_saved_at')            as drafts,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='image_variants')            as image_variants,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='orders'
             and column_name='awb_number')                as shipping_columns,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='conversations'
             and column_name='buyer_deleted_at')          as deleted_conversations_stay_deleted,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='bio')                       as profile_bio,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='cover_url')                 as profile_cover,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='push_messages_enabled')     as chat_push_prefs,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='push_activity_enabled')     as activity_push_prefs;

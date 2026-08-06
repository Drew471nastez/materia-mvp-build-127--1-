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

-- ===========================================================================
--  Storelib — where an imported listing came from
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent.
--
--  ADDITIVE. Every column here is nullable and nothing reads it unless it is
--  populated, so listings created by hand — which is all of them today — are
--  untouched and behave exactly as before. A product with `source_platform`
--  null is simply a product somebody typed in themselves.
--
--  ---------------------------------------------------------------------------
--  WHY THIS TABLE NEEDS TO EXIST AT ALL
--  ---------------------------------------------------------------------------
--  The importer can be run twice on the same profile. It WILL be: a seller
--  adds two items on Vinted and re-runs it, a scan times out halfway and gets
--  retried, somebody pastes the same URL twice because the first run took a
--  minute. Every one of those has to end with one Storelib listing per source
--  listing, not two.
--
--  The only honest way to do that is to remember, in the database, which
--  source item produced which row. A Set in a serverless function does not
--  survive the next request and is not shared with the instance handling it —
--  so a dedupe that lives in memory is a dedupe that does not exist.
--
--  ---------------------------------------------------------------------------
--  THE ORIGINAL PRICE IS KEPT, NOT JUST THE CONVERTED ONE
--  ---------------------------------------------------------------------------
--  A Vinted item priced at £25 becomes a RON price on Storelib. The moment
--  that conversion happens the original number is gone, and with it any way to
--  answer "was this converted correctly?" or to re-convert when a rate is
--  corrected. Both halves are stored: `price_cents` is what Storelib charges,
--  `source_price_amount`/`source_price_currency` is what the source said.
-- ===========================================================================

-- ── Provenance ─────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists source_platform text,
  add column if not exists source_item_id text,
  add column if not exists source_url text,
  add column if not exists source_imported_at timestamptz,
  add column if not exists source_price_amount numeric(12, 2),
  add column if not exists source_price_currency text;

comment on column public.products.source_platform is
  'Marketplace an imported listing came from (e.g. vinted). Null = created on Storelib.';
comment on column public.products.source_item_id is
  'The listing id on that marketplace. Unique per platform — see products_source_unique.';
comment on column public.products.source_price_amount is
  'The price as the source stated it, before currency conversion. Kept so the conversion stays auditable and re-runnable.';

-- ── Only a known platform, and never a half-record ─────────────────────────
--  A row with a source_item_id and no source_platform cannot be deduped
--  against anything, because the id is only unique WITHIN a platform. Vinted
--  item 6108438207 and some future Depop item 6108438207 are different things.
--  So the two are constrained to arrive together or not at all.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_source_pair_check'
  ) then
    alter table public.products
      add constraint products_source_pair_check
      check (
        (source_platform is null and source_item_id is null)
        or (source_platform is not null and source_item_id is not null)
      )
      not valid;                     -- see below
  end if;
end $$;

--  NOT VALID on purpose. Existing rows all have both columns null and pass
--  trivially, but validating rewrites the whole table with an ACCESS EXCLUSIVE
--  lock — a full-table lock on the busiest table in the product, to prove
--  something about rows that cannot violate it. New and updated rows are
--  checked from the moment the constraint exists, which is the part that
--  matters. Same reasoning as the messages_shape constraints in
--  RUN_MESSAGING_ALL.sql.

-- ── The index that makes re-import idempotent ──────────────────────────────
--  PARTIAL, so the millions of hand-made listings with null source columns do
--  not enter the index at all — a unique index over a mostly-null column is
--  mostly wasted pages, and in Postgres nulls do not conflict anyway, so
--  without the WHERE clause the index would be large and would still permit
--  every duplicate it was built to prevent.
--
--  This is what `on conflict` in the import route targets. If it is missing,
--  the route degrades to select-then-update rather than silently duplicating
--  — but it should not be missing, which is why this file exists.
create unique index if not exists products_source_unique
  on public.products (source_platform, source_item_id)
  where source_platform is not null and source_item_id is not null;

-- ── Reading a seller's imports back ────────────────────────────────────────
--  The importer page lists what it has already brought in, per profile, so a
--  second run can show "5 found, 5 already imported" instead of looking like
--  it did nothing.
create index if not exists products_source_url_idx
  on public.products (source_url)
  where source_url is not null;

-- ── Tell PostgREST the shape changed ───────────────────────────────────────
notify pgrst, 'reload schema';

-- ── A row an operator can read ─────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'products'
       and column_name like 'source_%')                       as source_columns_present,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'products_source_unique') as unique_index_present,
  (select count(*) from public.products where source_platform is not null) as imported_listings;

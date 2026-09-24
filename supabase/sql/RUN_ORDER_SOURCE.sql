-- ===========================================================================
--  WHERE AN ORDER CAME FROM: Storelib or the creator's website, and the detail
-- ===========================================================================
--  Run this in the Supabase SQL editor. Safe to run more than once, and safe
--  to run again if the first version of this file (source only) already ran.
--
--  Additive only: two nullable columns.
--
--    source         'storelib' or 'website'. Analytics counts sales by it.
--    source_detail  which page Buy was pressed on (the website and its
--                   address, a profile, a product page, the OnePage, Explore,
--                   a checkout link, an admin's test sale), where the visit
--                   came from before that (Instagram, Google, direct...) and
--                   utm_source / utm_campaign when the link had them. Hosts
--                   and words only, never a name, an email or an address.
--
--  Until they exist the checkout writes nothing extra (the tag is a separate
--  update after the order is saved, allowed to fail, see
--  lib/orders/order-source.ts), and an order's Source says Not recorded.
--  With only `source` present, the channel is written and the detail is not.
-- ===========================================================================

alter table public.orders
  add column if not exists source text;

alter table public.orders
  add column if not exists source_detail jsonb;

alter table public.orders
  drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source is null or source in ('storelib', 'website'));

-- Orders made before the column existed. A basket is only ever filled on a
-- website, and a basket is the one kind of payment that writes several orders
-- under one Stripe session, so those are known. Everything else from before
-- is left empty rather than guessed, and no old order is given a detail.
update public.orders o
   set source = 'website'
 where o.source is null
   and o.stripe_session_id is not null
   and exists (
     select 1 from public.orders other
      where other.stripe_session_id = o.stripe_session_id
        and other.id <> o.id
   );

-- ── Did it work? ───────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'source') as source_column_present,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'source_detail') as source_detail_column_present,
  (select count(*) from public.orders where source = 'website') as website_orders,
  (select count(*) from public.orders where source = 'storelib') as storelib_orders;

-- PostgREST answers from its own cached schema; without this the API keeps
-- reporting "Could not find the 'source_detail' column of 'orders'".
notify pgrst, 'reload schema';

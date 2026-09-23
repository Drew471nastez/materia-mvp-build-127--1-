-- ===========================================================================
--  WHERE AN ORDER CAME FROM: Storelib or the creator's website
-- ===========================================================================
--  Run this in the Supabase SQL editor. Safe to run more than once.
--
--  Additive only: one new nullable column. Until it exists the checkout
--  writes nothing extra (the tag is a separate update that is allowed to
--  fail, see lib/orders/order-source.ts), and the Orders table shows a dash
--  in the Source column.
-- ===========================================================================

alter table public.orders
  add column if not exists source text;

alter table public.orders
  drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source is null or source in ('storelib', 'website'));

-- Orders made before the column existed. A basket is only ever filled on a
-- website, and a basket is the one kind of payment that writes several orders
-- under one Stripe session, so those are known. Everything else from before
-- is left empty rather than guessed.
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
  (select count(*) from public.orders where source = 'website') as website_orders,
  (select count(*) from public.orders where source = 'storelib') as storelib_orders;

-- PostgREST answers from its own cached schema; without this the API keeps
-- reporting "Could not find the 'source' column of 'orders'".
notify pgrst, 'reload schema';

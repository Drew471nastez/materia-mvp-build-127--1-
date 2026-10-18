-- ===========================================================================
--  BEFORE PARTS 244 AND 245: READ ONLY. Changes nothing.
-- ===========================================================================
-- Run in the Supabase SQL editor. Save the output: step 3 compares with it.
-- Every row should read as described; stop if one does not.

-- 1. The tables the parts touch exist, and how big they are.
select 'orders' as tbl, to_regclass('public.orders') is not null as present, (select count(*) from public.orders) as rows
union all select 'products', to_regclass('public.products') is not null, (select count(*) from public.products)
union all select 'product_variants', to_regclass('public.product_variants') is not null, (select count(*) from public.product_variants);

-- 2. Already run? (true here means part 244 or 245 ran before: safe, they only add what is missing.)
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'pricing_context') as p244_already,
  to_regclass('public.price_corrections') is not null as p245_already;

-- 3. The checks the parts add (expect zero rows before the first run; after it, these five).
select conname, conrelid::regclass as on_table, convalidated from pg_constraint
 where conname in ('orders_pricing_context_check', 'orders_price_source_check', 'orders_list_amount_check', 'products_marketplace_usd_check', 'product_variants_marketplace_usd_check');

-- 4. Nothing is holding these tables right now (expect zero rows; if any, wait).
select pid, state, now() - xact_start as open_for, left(query, 120) as query
  from pg_stat_activity
 where datname = current_database() and pid <> pg_backend_pid() and xact_start is not null and now() - xact_start > interval '30 seconds';

-- 5. The fingerprint of every order's money, to compare after (step 3).
select count(*) as orders, coalesce(sum(amount_cents), 0) as amount_cents_total,
       md5(coalesce(string_agg(id::text || ':' || coalesce(amount_cents::text, '') || ':' || coalesce(currency, '') || ':' || coalesce(status, ''), ',' order by id), '')) as orders_fingerprint
  from public.orders;
select md5(coalesce(string_agg(id::text || ':' || coalesce(price_cents::text, ''), ',' order by id), '')) as products_fingerprint from public.products;

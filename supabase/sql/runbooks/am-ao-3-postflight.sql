-- ===========================================================================
--  AFTER PARTS 244 AND 245: READ ONLY. Compare with step 1's output.
-- ===========================================================================
-- 1. Both parts are in (expect true, true).
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'pricing_context')
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'marketplace_usd_cents')
  and exists (select 1 from pg_constraint where conname = 'orders_pricing_context_check') as p244,
  to_regclass('public.price_corrections') is not null as p245;

-- 2. No existing row was touched: these must equal step 1's numbers exactly.
select count(*) as orders, coalesce(sum(amount_cents), 0) as amount_cents_total,
       md5(coalesce(string_agg(id::text || ':' || coalesce(amount_cents::text, '') || ':' || coalesce(currency, '') || ':' || coalesce(status, ''), ',' order by id), '')) as orders_fingerprint
  from public.orders;
select md5(coalesce(string_agg(id::text || ':' || coalesce(price_cents::text, ''), ',' order by id), '')) as products_fingerprint from public.products;

-- 3. The new columns are empty until the app writes them (expect 0, 0).
select (select count(*) from public.orders where pricing_context is not null) as orders_tagged,
       (select count(*) from public.products where marketplace_usd_cents is not null) as dollar_prices_set;

-- 4. price_corrections is admin only (expect: rls on, no anon or authenticated grants).
select relrowsecurity as rls_on from pg_class where oid = 'public.price_corrections'::regclass;
select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'price_corrections' and grantee in ('anon', 'authenticated');

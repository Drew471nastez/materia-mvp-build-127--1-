-- ===========================================================================
--  STORELIB CURRENCY LAUNCH: ONE FILE, SAFE TO RUN AGAIN
-- ===========================================================================
-- Paste the whole file into the Supabase SQL editor and press Run.
--
-- In ONE transaction it:
--   1. adds SQL parts 244 (marketplace pricing columns) and 245
--      (price_corrections), only what is missing;
--   2. puts back the prices the old 4.6 conversion multiplied, ONLY where the
--      product's own order from before the conversion proves the old price
--      in the currency the store sells in (platform currency: USD). Every
--      change is written to price_corrections first and can be undone;
--   3. checks that no order changed (fingerprint of every order's id,
--      amount, currency and status before and after). If anything differs,
--      or anything fails, NOTHING is kept;
--   4. makes sure a fresh exchange rate exists (the ECB reference rates of
--      2026-10-16, only if the table has nothing newer; the daily job keeps
--      it fresh after that). Without a rate under 4 days old the marketplace
--      keeps showing the store's own currency;
--   5. unlocks MARKETPLACE_USD=all (platform_migrations row
--      marketplace_usd_launch) only when a real marketplace US dollar sale
--      that was refunded is on record and no order of the last 30 days has
--      an unknown currency. Until then "all" acts as off in the app.
-- Then it shows one report. Orders, payments and receipts are never edited.
--
-- "lock timeout" error: the tables were busy; nothing changed, run it again.

create temp table if not exists _launch_report (n serial, section text, item text, detail text);
truncate _launch_report;

do $launch$
declare
  v_platform constant text := 'usd';     -- NEXT_PUBLIC_PLATFORM_CURRENCY=USD
  v_approved_by constant text := 'Andrew';
  v_batch text := 'ao-' || to_char(now(), 'YYYY-MM-DD-HH24MISS');
  v_before text;
  v_after text;
  v_orders bigint;
  v_total bigint;
  v_applied_at timestamptz;
  v_fields int := 0;
  v_products int := 0;
  v_mp_sales int := 0;
  v_mp_refunded int := 0;
  v_unknown_recent int := 0;
  v_unknown_all int := 0;
  r record;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '120s', true);

  if to_regclass('public.orders') is null or to_regclass('public.products') is null then
    raise exception 'No orders or products table: this is not the Storelib database. Nothing was changed.';
  end if;

  -- 0. Fingerprint of every order before anything runs.
  select count(*), coalesce(sum(amount_cents), 0),
         md5(coalesce(string_agg(id::text || ':' || coalesce(amount_cents::text, '') || ':' || coalesce(currency, '') || ':' || coalesce(status, ''), ',' order by id), ''))
    into v_orders, v_total, v_before
    from public.orders;

  -- 1. SQL part 244: marketplace pricing columns (nullable, checks NOT VALID, no row changes).
  alter table public.orders
    add column if not exists pricing_context text,
    add column if not exists list_currency text,
    add column if not exists list_amount_cents bigint,
    add column if not exists price_source text,
    add column if not exists fx_as_of date,
    add column if not exists fx_rate numeric(20,10);
  if not exists (select 1 from pg_constraint where conname = 'orders_pricing_context_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_pricing_context_check check (pricing_context is null or pricing_context in ('merchant', 'marketplace')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_price_source_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_price_source_check check (price_source is null or price_source in ('native', 'fixed', 'converted')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_list_amount_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_list_amount_check check ((list_amount_cents is null or list_amount_cents >= 0) and (list_currency is null or list_currency ~ '^[a-z]{3}$') and (fx_rate is null or fx_rate > 0)) not valid;
  end if;
  alter table public.products
    add column if not exists marketplace_usd_cents integer,
    add column if not exists marketplace_usd_approved_at timestamptz;
  if not exists (select 1 from pg_constraint where conname = 'products_marketplace_usd_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_marketplace_usd_check check (marketplace_usd_cents is null or (marketplace_usd_cents >= 0 and marketplace_usd_cents <= 100000000)) not valid;
  end if;
  if to_regclass('public.product_variants') is not null then
    alter table public.product_variants
      add column if not exists marketplace_usd_cents integer,
      add column if not exists marketplace_usd_approved_at timestamptz;
    if not exists (select 1 from pg_constraint where conname = 'product_variants_marketplace_usd_check' and conrelid = 'public.product_variants'::regclass) then
      alter table public.product_variants add constraint product_variants_marketplace_usd_check check (marketplace_usd_cents is null or (marketplace_usd_cents >= 0 and marketplace_usd_cents <= 100000000)) not valid;
    end if;
  end if;

  -- 2. SQL part 245: price_corrections, admin only.
  create table if not exists public.price_corrections (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    batch text not null check (length(batch) between 6 and 80),
    product_id uuid not null,
    variant_id uuid,
    field text not null check (field in ('price_cents', 'pwyw_min_price_cents', 'pwyw_suggested_price_cents', 'compare_at_cents', 'variant_price_cents')),
    before_cents bigint not null check (before_cents >= 0),
    after_cents bigint not null check (after_cents >= 0),
    proof text not null check (length(proof) between 10 and 600),
    approved_by text not null check (length(approved_by) between 2 and 120),
    applied_at timestamptz,
    undone_at timestamptz);
  create index if not exists price_corrections_product on public.price_corrections (product_id, created_at desc);
  alter table public.price_corrections enable row level security;
  revoke all on public.price_corrections from anon, authenticated;

  insert into _launch_report (section, item, detail) values
    ('1 migrations', 'part 244 (marketplace pricing columns)', 'in'),
    ('1 migrations', 'part 245 (price_corrections, admin only)', 'in');

  -- platform_migrations holds the launch lock: admin only, so nobody can
  -- unlock MARKETPLACE_USD=all through the public API.
  create table if not exists public.platform_migrations (key text primary key, applied_at timestamptz not null default now(), note text);
  alter table public.platform_migrations add column if not exists note text;
  alter table public.platform_migrations enable row level security;
  revoke all on public.platform_migrations from anon, authenticated;
  insert into _launch_report (section, item, detail) values ('1 migrations', 'platform_migrations', 'admin only (row level security on, no public access)');

  -- 3. Prices: restore only what an order proves.
  select applied_at into v_applied_at from public.platform_migrations where key = 'currency_ron_2026';
  if v_applied_at is null then
    insert into _launch_report (section, item, detail) values ('2 prices', 'restore', 'no 4.6 conversion is recorded (no currency_ron_2026 marker): nothing to put back');
  elsif to_regclass('public.store_activity_log') is null or to_regclass('public.store_settings') is null or to_regclass('public.product_variants') is null then
    insert into _launch_report (section, item, detail) values ('2 prices', 'restore', 'skipped: store_activity_log, store_settings or product_variants is missing, so a price cannot be proven');
  else
    create temp table _fix on commit drop as
    with cand as (
      select pr.id, pr.price_cents, pr.pwyw_min_price_cents, pr.pwyw_suggested_price_cents, pr.compare_at_cents,
             coalesce(case when lower(btrim(ss.currency)) ~ '^[a-z]{3}$' then lower(btrim(ss.currency)) end, v_platform) as sells_in,
             round(pr.price_cents / 4.6)::bigint as original_cents
        from public.products pr
        left join public.store_settings ss on ss.creator_id = pr.creator_id
       where pr.created_at < v_applied_at
         and pr.price_cents > 0
         and not exists (select 1 from public.price_corrections pc where pc.product_id = pr.id and pc.applied_at is not null and pc.undone_at is null)
         and round(round(pr.price_cents / 4.6) * 4.6) = pr.price_cents
    ),
    proven as (
      select c.*,
             (select array_agg(distinct lower(btrim(o.currency))) from public.orders o
               where o.product_id = c.id and o.created_at < v_applied_at and o.status in ('completed', 'refunded')
                 and lower(btrim(o.currency)) ~ '^[a-z]{3}$') as currencies_before
        from cand c
       where not exists (select 1 from public.store_activity_log l
                          where l.action = 'product.price' and l.subject_id = c.id::text and l.created_at > v_applied_at)
         and exists (select 1 from public.orders o
                      where o.product_id = c.id and o.created_at < v_applied_at and o.status in ('completed', 'refunded')
                        and o.variant_id is null and lower(btrim(o.currency)) ~ '^[a-z]{3}$'
                        and greatest(0, coalesce(o.amount_cents, 0) - coalesce(o.tip_cents, 0)) = c.original_cents)
         and not exists (select 1 from public.product_variants v
                          where v.product_id = c.id and v.price_cents > 0 and v.created_at < v_applied_at)
    ),
    ok as (
      select p.* from proven p
       where array_length(p.currencies_before, 1) = 1 and p.currencies_before[1] = p.sells_in
         and (coalesce(p.pwyw_min_price_cents, 0) = 0 or round(round(p.pwyw_min_price_cents / 4.6) * 4.6) = p.pwyw_min_price_cents)
         and (coalesce(p.pwyw_suggested_price_cents, 0) = 0 or round(round(p.pwyw_suggested_price_cents / 4.6) * 4.6) = p.pwyw_suggested_price_cents)
         and (coalesce(p.compare_at_cents, 0) = 0 or round(round(p.compare_at_cents / 4.6) * 4.6) = p.compare_at_cents)
    )
    select id as product_id, f.field, f.before_cents, round(f.before_cents / 4.6)::bigint as after_cents,
           'an order of ' || round(original_cents / 100.0, 2) || ' ' || currencies_before[1] || ' before the conversion; now ' || round(price_cents / 100.0, 2) || ' ' || sells_in as proof
      from ok
      cross join lateral (values ('price_cents', price_cents::bigint),
                                 ('pwyw_min_price_cents', pwyw_min_price_cents::bigint),
                                 ('pwyw_suggested_price_cents', pwyw_suggested_price_cents::bigint),
                                 ('compare_at_cents', compare_at_cents::bigint)) as f(field, before_cents)
     where coalesce(f.before_cents, 0) > 0;

    insert into public.price_corrections (batch, product_id, field, before_cents, after_cents, proof, approved_by)
    select v_batch, product_id, field, before_cents, after_cents, proof, v_approved_by from _fix;

    update public.products p set price_cents = f.after_cents from _fix f
     where f.field = 'price_cents' and p.id = f.product_id and p.price_cents = f.before_cents;
    update public.products p set pwyw_min_price_cents = f.after_cents from _fix f
     where f.field = 'pwyw_min_price_cents' and p.id = f.product_id and p.pwyw_min_price_cents = f.before_cents;
    update public.products p set pwyw_suggested_price_cents = f.after_cents from _fix f
     where f.field = 'pwyw_suggested_price_cents' and p.id = f.product_id and p.pwyw_suggested_price_cents = f.before_cents;
    update public.products p set compare_at_cents = f.after_cents from _fix f
     where f.field = 'compare_at_cents' and p.id = f.product_id and p.compare_at_cents = f.before_cents;

    update public.price_corrections c set applied_at = now()
      from public.products p
     where c.batch = v_batch and c.product_id = p.id and c.applied_at is null
       and case c.field when 'price_cents' then p.price_cents
                        when 'pwyw_min_price_cents' then p.pwyw_min_price_cents
                        when 'pwyw_suggested_price_cents' then p.pwyw_suggested_price_cents
                        when 'compare_at_cents' then p.compare_at_cents end = c.after_cents;
    get diagnostics v_fields = row_count;
    select count(distinct product_id) into v_products from _fix;

    insert into _launch_report (section, item, detail)
    values ('2 prices', 'restored (proven by the product''s own order)',
            v_fields || ' field(s) on ' || v_products || ' product(s)' || case when v_fields > 0 then ', batch ' || v_batch || ' (undo: supabase/sql/runbooks/ap-5b-price-undo.sql)' else '' end);
    insert into _launch_report (section, item, detail)
    select '2 prices', 'restored: ' || coalesce(p.title, f.product_id::text), f.field || ' ' || round(f.before_cents / 100.0, 2) || ' -> ' || round(f.after_cents / 100.0, 2) || ' (' || f.proof || ')'
      from _fix f left join public.products p on p.id = f.product_id;

    -- Still multiplied but not provable: left as is, the creator decides.
    insert into _launch_report (section, item, detail)
    select '2 prices', 'creator to confirm: ' || coalesce(pr.title, pr.id::text),
           'now ' || round(pr.price_cents / 100.0, 2) || ', maybe ' || round(round(pr.price_cents / 4.6) / 100.0, 2) || ' before the conversion; left unchanged: its orders do not prove the old price (no order, options, another currency, or an extra price edited)'
      from public.products pr
     where pr.created_at < v_applied_at and pr.price_cents > 0
       and round(round(pr.price_cents / 4.6) * 4.6) = pr.price_cents
       and not exists (select 1 from public.price_corrections pc where pc.product_id = pr.id and pc.applied_at is not null and pc.undone_at is null)
       and not exists (select 1 from public.store_activity_log l where l.action = 'product.price' and l.subject_id = pr.id::text and l.created_at > v_applied_at)
     order by pr.title
     limit 300;
  end if;

  -- 4. Orders untouched: the same fingerprint, or nothing is kept.
  select md5(coalesce(string_agg(id::text || ':' || coalesce(amount_cents::text, '') || ':' || coalesce(currency, '') || ':' || coalesce(status, ''), ',' order by id), ''))
    into v_after from public.orders;
  if v_after is distinct from v_before then
    raise exception 'Orders changed during the run (fingerprint % -> %). Everything was rolled back.', v_before, v_after;
  end if;
  insert into _launch_report (section, item, detail) values
    ('3 orders', 'unchanged', v_orders || ' orders, ' || v_total || ' cents in total, fingerprint ' || v_before || ' before and after');

  select count(*) into v_unknown_all from public.orders where currency is null or lower(btrim(currency)) !~ '^[a-z]{3}$';
  select count(*) into v_unknown_recent from public.orders
   where (currency is null or lower(btrim(currency)) !~ '^[a-z]{3}$') and created_at > now() - interval '30 days';
  insert into _launch_report (section, item, detail) values
    ('3 orders', 'with no known currency', v_unknown_all || ' in total, ' || v_unknown_recent || ' in the last 30 days (their emails are held; confirm each from Stripe)');
  insert into _launch_report (section, item, detail)
  select '3 orders', 'paid in ' || coalesce(lower(btrim(currency)), '?'), count(*) || ' orders, ' || sum(amount_cents) || ' cents'
    from public.orders where status in ('completed', 'refunded') group by lower(btrim(currency)) order by count(*) desc;

  -- 5. Creators whose Stripe payouts may be blocked (country from the last account sync).
  if to_regclass('public.creators') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'stripe_account_country') then
    for r in
      select c.slug, upper(c.stripe_account_country) as cc,
             (select count(*) from public.orders o where o.creator_id = c.id and o.status in ('completed', 'refunded')) as paid
        from public.creators c
       where c.stripe_account_id is not null and upper(coalesce(c.stripe_account_country, '')) <> 'RO'
       order by 3 desc
    loop
      insert into _launch_report (section, item, detail) values ('4 payouts', coalesce(r.slug, '?') || ' (' || coalesce(r.cc, 'country unknown') || ', ' || r.paid || ' paid orders)',
        case when r.cc is null then 'country not synced yet: they open Settings > Payments once'
             when r.cc in ('US','GB','CA','CH','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','SK','SI','ES','SE','IS','LI','NO')
               then 'cross-border: fine on the full agreement; if Stripe shows "recipient", they disconnect (balance at zero) and set up again'
             else 'outside the US/UK/EEA/CA/CH: Stripe cannot pay them out from Romania' end);
    end loop;
    if not found then
      insert into _launch_report (section, item, detail) values ('4 payouts', 'every connected creator', 'is in Romania: no cross-border payout issue');
    end if;
  end if;

  -- 5b. Exchange rate: the marketplace converts only with an ECB rate under 4 days old.
  -- ECB euro reference rates published 2026-10-16 (www.ecb.europa.eu/stats/eurofxref), copied as published,
  -- added only when the table has nothing as new; the daily /api/cron/fx-rates job keeps it fresh afterwards.
  if to_regclass('public.fx_rates') is not null then
    insert into public.fx_rates (as_of, base, rates, source)
    select date '2026-10-16', 'EUR', '{"USD":1.1253,"JPY":177.82,"CZK":24.323,"DKK":7.4748,"GBP":0.84385,"HUF":363.08,"PLN":4.37,"RON":5.331,"SEK":11.145,"CHF":0.9272,"ISK":136.2,"NOK":10.624,"TRY":55.7328,"AUD":1.6171,"BRL":5.7197,"CAD":1.5935,"CNY":7.524,"HKD":8.8316,"IDR":20290.28,"ILS":3.4822,"INR":106.864,"KRW":1499.01,"MXN":20.6871,"MYR":4.5929,"NZD":1.9868,"PHP":70.858,"SGD":1.4395,"THB":37.602,"ZAR":18.493}'::jsonb, 'ecb'
     where not exists (select 1 from public.fx_rates where as_of >= date '2026-10-16');
    insert into _launch_report (section, item, detail)
    select '5 rates', 'newest exchange rate', max(as_of)::text ||
           case when max(as_of) >= current_date - 4 then ' (fresh: marketplace can show USD)' else ' (OLD: marketplace waits; the daily fx-rates job is not running)' end
      from public.fx_rates;
  else
    insert into _launch_report (section, item, detail) values ('5 rates', 'fx_rates table', 'MISSING: SQL part 136 (markets) has not been run, so the marketplace cannot convert');
  end if;

  -- 6. Global launch: only after a real marketplace dollar sale was refunded.
  select count(*) into v_mp_sales from public.orders
   where pricing_context = 'marketplace' and lower(btrim(currency)) = 'usd' and status in ('completed', 'refunded');
  -- (read through to_jsonb so a database without the refund columns still runs)
  select count(*) into v_mp_refunded from public.orders o
   where o.pricing_context = 'marketplace' and lower(btrim(o.currency)) = 'usd'
     and (o.status = 'refunded' or coalesce((to_jsonb(o) ->> 'refund_amount_cents')::bigint, 0) > 0 or (to_jsonb(o) ->> 'refunded_at') is not null);

  if exists (select 1 from public.platform_migrations where key = 'marketplace_usd_launch') then
    insert into _launch_report (section, item, detail) values ('5 launch', 'MARKETPLACE_USD=all', 'UNLOCKED (already verified earlier)');
  elsif v_mp_sales >= 1 and v_mp_refunded >= 1 and v_unknown_recent = 0 then
    insert into public.platform_migrations (key, note) values ('marketplace_usd_launch', 'verified by storelib-currency-launch.sql: ' || v_mp_sales || ' marketplace USD sale(s), ' || v_mp_refunded || ' refunded');
    insert into _launch_report (section, item, detail) values ('5 launch', 'MARKETPLACE_USD=all',
      'UNLOCKED now: ' || v_mp_sales || ' marketplace dollar sale(s), ' || v_mp_refunded || ' refunded, no unknown currency in 30 days');
  else
    insert into _launch_report (section, item, detail) values ('5 launch', 'MARKETPLACE_USD=all',
      'LOCKED (acts as off): marketplace dollar sales ' || v_mp_sales || ' (need 1+), refunded ' || v_mp_refunded || ' (need 1+), unknown-currency orders in 30 days ' || v_unknown_recent || ' (need 0). Do the one-creator test, then run this file again.');
  end if;

  perform pg_notify('pgrst', 'reload schema');
end
$launch$;

select section, item, detail from _launch_report order by n;

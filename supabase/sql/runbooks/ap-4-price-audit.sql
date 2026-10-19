-- ===========================================================================
--  STEP 4: PRICE AUDIT (READ ONLY). Changes nothing.
-- ===========================================================================
-- Lists every product the old 4.6 conversion could have multiplied, and
-- whether its OWN order from before the conversion proves the old price.
-- First line: put production's platform currency ('usd' or 'ron'), as shown in
-- Admin > Payments > Configuration > Platform currency. Left as null, a store
-- with no currency of its own is never "confirmed".
with params as (select null::text as platform_currency),
marker as (select applied_at from public.platform_migrations where key = 'currency_ron_2026'),
cand as (
  select pr.id, pr.title, pr.creator_id, pr.price_cents, pr.created_at,
         (coalesce(pr.pwyw_min_price_cents, 0) = 0 or round(round(pr.pwyw_min_price_cents / 4.6) * 4.6) = pr.pwyw_min_price_cents)
         and (coalesce(pr.pwyw_suggested_price_cents, 0) = 0 or round(round(pr.pwyw_suggested_price_cents / 4.6) * 4.6) = pr.pwyw_suggested_price_cents)
         and (coalesce(pr.compare_at_cents, 0) = 0 or round(round(pr.compare_at_cents / 4.6) * 4.6) = pr.compare_at_cents) as extras_fit,
         case when lower(btrim(ss.currency)) ~ '^[a-z]{3}$' then lower(btrim(ss.currency)) end as store_currency,
         round(pr.price_cents / 4.6)::bigint as original_cents,
         m.applied_at
    from public.products pr
    cross join marker m
    left join public.store_settings ss on ss.creator_id = pr.creator_id
   where pr.created_at < m.applied_at
     and pr.price_cents > 0
     and not exists (select 1 from public.price_corrections pc where pc.product_id = pr.id and pc.applied_at is not null and pc.undone_at is null)
     and round(round(pr.price_cents / 4.6) * 4.6) = pr.price_cents
),
facts as (
  select c.*,
         coalesce(c.store_currency, lower((select platform_currency from params))) as sells_in,
         (select count(*) from public.store_activity_log l
           where l.action = 'product.price' and l.subject_id = c.id::text and l.created_at > c.applied_at) as edits_since,
         (select count(*) from public.orders o
           where o.product_id = c.id and o.created_at < c.applied_at and o.status in ('completed', 'refunded')) as orders_before,
         exists (select 1 from public.product_variants v
                  where v.product_id = c.id and v.price_cents > 0 and v.created_at < c.applied_at) as has_old_options,
         (select count(*) from public.orders o
           where o.product_id = c.id and o.created_at < c.applied_at and o.status in ('completed', 'refunded')
             and o.variant_id is null and lower(btrim(o.currency)) ~ '^[a-z]{3}$'
             and greatest(0, coalesce(o.amount_cents, 0) - coalesce(o.tip_cents, 0)) = c.original_cents) as matching_orders,
         (select array_agg(distinct lower(btrim(o.currency))) from public.orders o
           where o.product_id = c.id and o.created_at < c.applied_at and o.status in ('completed', 'refunded')
             and lower(btrim(o.currency)) ~ '^[a-z]{3}$') as currencies_before
    from cand c
)
select id, title,
       round(price_cents / 100.0, 2) as price_now,
       round(original_cents / 100.0, 2) as price_before_conversion,
       sells_in,
       case
         when edits_since > 0 then 'not-affected'
         when has_old_options then 'needs-creator'
         when not extras_fit then 'needs-creator'
         when matching_orders = 0 then 'needs-creator'
         when coalesce(array_length(currencies_before, 1), 0) <> 1 then 'needs-creator'
         when currencies_before[1] is distinct from sells_in then 'needs-creator'
         else 'confirmed'
       end as verdict,
       case
         when edits_since > 0 then 'the creator changed its price after the conversion'
         when has_old_options then 'it has priced options from before the conversion: the creator confirms those'
         when not extras_fit then 'its sale, compare-at or pay-what-you-want price was edited since'
         when matching_orders = 0 and orders_before = 0 then 'no order before the conversion proves its price or currency'
         when matching_orders = 0 then 'orders before the conversion do not show this price'
         when coalesce(array_length(currencies_before, 1), 0) <> 1 then 'orders before it were charged in more than one currency: ' || array_to_string(currencies_before, ', ')
         when currencies_before[1] is distinct from sells_in then 'charged in ' || currencies_before[1] || ' before, the store sells in ' || coalesce(sells_in, 'an unknown currency') || ' now'
         else 'an order of ' || round(original_cents / 100.0, 2) || ' ' || currencies_before[1] || ' before the conversion'
       end as reason,
       orders_before, matching_orders
  from facts
 order by verdict, title;

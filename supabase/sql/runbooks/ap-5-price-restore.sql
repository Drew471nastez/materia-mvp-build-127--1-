-- ===========================================================================
--  STEP 5: PUT BACK ONLY THE PRICES STEP 4 PROVED (writes; undo below)
-- ===========================================================================
-- Fill in the three values on the first lines, then run the whole block.
-- It proves every product again, exactly like step 4, and restores only the
-- "confirmed" ones. For each field it first writes a row in price_corrections
-- (before, after, proof, who approved), then changes the price only if it is
-- still the value it read. A product with priced options made before the
-- conversion is skipped whole (the creator decides those). Orders, payments
-- and receipts are never touched. Everything happens in one go: if anything
-- fails, nothing changes.
do $restore$
declare
  v_platform text := null;               -- production's platform currency: 'usd' or 'ron'
  v_approved_by text := 'Andrew';        -- who approved this
  v_batch text := 'ao-' || to_char(now(), 'YYYY-MM-DD-HH24MISS');
  v_applied_at timestamptz;
  v_fields int;
  v_changed int;
begin
  if v_platform is null or lower(v_platform) !~ '^[a-z]{3}$' then
    raise exception 'Set v_platform to production''s platform currency first. Nothing was changed.';
  end if;
  select applied_at into v_applied_at from public.platform_migrations where key = 'currency_ron_2026';
  if v_applied_at is null then
    raise exception 'No currency_ron_2026 marker: no 4.6 conversion is recorded, nothing to undo. Nothing was changed.';
  end if;

  create temp table _fix on commit drop as
  with cand as (
    select pr.id, pr.price_cents, pr.pwyw_min_price_cents, pr.pwyw_suggested_price_cents, pr.compare_at_cents,
           coalesce(case when lower(btrim(ss.currency)) ~ '^[a-z]{3}$' then lower(btrim(ss.currency)) end, lower(v_platform)) as sells_in,
           round(pr.price_cents / 4.6)::bigint as original_cents
      from public.products pr
      left join public.store_settings ss on ss.creator_id = pr.creator_id
     where pr.created_at < v_applied_at
       and pr.price_cents > 0
       -- never restore a product twice
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
       -- an extra price that is not a multiplied value was edited since: leave the whole product
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

  select count(*) into v_fields from _fix;

  insert into public.price_corrections (batch, product_id, field, before_cents, after_cents, proof, approved_by)
  select v_batch, product_id, field, before_cents, after_cents, proof, v_approved_by from _fix;

  update public.products p set price_cents = f.after_cents
    from _fix f where f.field = 'price_cents' and p.id = f.product_id and p.price_cents = f.before_cents;
  update public.products p set pwyw_min_price_cents = f.after_cents
    from _fix f where f.field = 'pwyw_min_price_cents' and p.id = f.product_id and p.pwyw_min_price_cents = f.before_cents;
  update public.products p set pwyw_suggested_price_cents = f.after_cents
    from _fix f where f.field = 'pwyw_suggested_price_cents' and p.id = f.product_id and p.pwyw_suggested_price_cents = f.before_cents;
  update public.products p set compare_at_cents = f.after_cents
    from _fix f where f.field = 'compare_at_cents' and p.id = f.product_id and p.compare_at_cents = f.before_cents;

  update public.price_corrections c set applied_at = now()
    from public.products p
   where c.batch = v_batch and c.product_id = p.id and c.applied_at is null
     and case c.field when 'price_cents' then p.price_cents
                      when 'pwyw_min_price_cents' then p.pwyw_min_price_cents
                      when 'pwyw_suggested_price_cents' then p.pwyw_suggested_price_cents
                      when 'compare_at_cents' then p.compare_at_cents end = c.after_cents;
  get diagnostics v_changed = row_count;

  raise notice 'Batch %: % field(s) on % product(s) restored. To undo, run step 5b with this batch name.',
    v_batch, v_changed, (select count(distinct product_id) from _fix);
end
$restore$;

-- What the batch did (read only).
select batch, product_id, field, round(before_cents / 100.0, 2) as was, round(after_cents / 100.0, 2) as now, proof, approved_by, applied_at
  from public.price_corrections
 where created_at > now() - interval '1 hour'
 order by created_at desc;

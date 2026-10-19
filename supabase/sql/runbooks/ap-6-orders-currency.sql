-- ===========================================================================
--  STEP 6 (DATABASE SIDE): ORDERS WITH NO KNOWN CURRENCY (READ ONLY)
-- ===========================================================================
-- Their emails are held (never sent with an ambiguous amount). Each one needs
-- its currency confirmed from Stripe before anything is changed. Expect 0.
select status, count(*) as orders, coalesce(sum(amount_cents), 0) as amount_cents
  from public.orders
 where currency is null or lower(btrim(currency)) !~ '^[a-z]{3}$'
 group by status order by orders desc;

-- And the currencies all paid orders were charged in (for the record).
select lower(btrim(currency)) as currency, count(*) as orders, sum(amount_cents) as amount_cents
  from public.orders where status in ('completed', 'refunded')
 group by 1 order by orders desc;

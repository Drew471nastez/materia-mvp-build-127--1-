-- ===========================================================================
--  SWITCH THE PLATFORM TO LEI
-- ===========================================================================
--
--  READ THIS BEFORE RUNNING IT. This rewrites every price in the catalogue.
--
--  WHAT IS WRONG TODAY
--  `products.price_cents` holds USD cents. The interface converts them to RON
--  at a static rate of 4.6 purely for display, and the card is charged in USD.
--  So a buyer reads "382,35 RON" on the checkout page and their bank takes
--  about $382 — roughly 1,758 lei — then converts it back at its own rate with
--  its own margin. The number shown was never the number charged.
--
--  WHAT THIS DOES
--  Multiplies every stored amount by the same 4.6 the display has always used,
--  so a listing that READ as 460 lei on the site remains 460 lei — and is now
--  actually charged as 460 lei. Nothing changes for a shopper looking at the
--  catalogue. Everything changes for what their bank does.
--
--  THE ORDER MATTERS, and getting it wrong is expensive in one direction:
--
--    1. Run this migration.
--    2. THEN set NEXT_PUBLIC_PLATFORM_CURRENCY=ron in Vercel and redeploy.
--
--  Setting the flag FIRST charges lei against dollar-denominated rows — a
--  $100 listing sells for 100 lei, a 78% discount applied silently to
--  everything you have. Running this migration first is safe in the other
--  direction: prices are briefly quoted high in USD terms, which fails loudly
--  rather than quietly.
--
--  ONLY ONCE. Running it twice multiplies by 4.6 again. The guard below makes
--  a second run a no-op rather than a catastrophe.
-- ===========================================================================

-- The rate the display has used since the beginning. Keeping the same number
-- is what makes this invisible to anyone browsing: the lei figure on screen
-- before and after is identical.
--
-- It is a static approximation, and that is fine HERE — it is being used once,
-- to restate existing prices, not as a live FX feed. After this migration
-- nothing converts anything: prices are lei, charges are lei.

-- ── The guard ──────────────────────────────────────────────────────────────
-- A marker row, so a second run cannot double the catalogue.
create table if not exists public.platform_migrations (
  key text primary key,
  applied_at timestamptz not null default now(),
  note text
);

do $$
declare
  already boolean;
  affected integer;
begin
  select exists(select 1 from public.platform_migrations where key = 'currency_ron_2026') into already;

  if already then
    raise notice 'Already applied — nothing to do. Prices are already in lei.';
    return;
  end if;

  -- Products.
  update public.products
     set price_cents = round(price_cents * 4.6)
   where price_cents is not null and price_cents > 0;
  get diagnostics affected = row_count;
  raise notice 'products repriced: %', affected;

  -- Variants carry their own prices and would otherwise be left in dollars,
  -- which is the kind of half-migration that shows up as one listing costing
  -- a fifth of what its variants do.
  update public.product_variants
     set price_cents = round(price_cents * 4.6)
   where price_cents is not null and price_cents > 0;
  get diagnostics affected = row_count;
  raise notice 'variants repriced: %', affected;

  -- Pay-what-you-want floors and suggestions, for the same reason.
  update public.products
     set pwyw_min_price_cents = round(pwyw_min_price_cents * 4.6)
   where pwyw_min_price_cents is not null and pwyw_min_price_cents > 0;

  update public.products
     set pwyw_suggested_price_cents = round(pwyw_suggested_price_cents * 4.6)
   where pwyw_suggested_price_cents is not null and pwyw_suggested_price_cents > 0;

  -- Compare-at prices, so a strikethrough does not end up below the real price.
  begin
    update public.products
       set compare_at_cents = round(compare_at_cents * 4.6)
     where compare_at_cents is not null and compare_at_cents > 0;
  exception when undefined_column then
    raise notice 'no compare_at_cents column — skipped';
  end;

  insert into public.platform_migrations (key, note)
  values ('currency_ron_2026', 'products/variants/pwyw repriced from USD cents to RON bani at 4.6');
end $$;

-- ── HISTORICAL ORDERS ARE DELIBERATELY NOT TOUCHED ─────────────────────────
-- `orders.amount_cents` records what was actually charged, in the currency it
-- was actually charged in. Rewriting it would falsify receipts and make past
-- payouts irreconcilable with Stripe. An old order is a dollar order and
-- should stay one; only future ones are in lei.

-- ── Did it work? ───────────────────────────────────────────────────────────
select
  (select count(*) from public.platform_migrations where key = 'currency_ron_2026') as applied,
  (select count(*) from public.products where price_cents > 0) as priced_products,
  (select round(avg(price_cents) / 100.0, 2) from public.products where price_cents > 0) as avg_price_major;

notify pgrst, 'reload schema';

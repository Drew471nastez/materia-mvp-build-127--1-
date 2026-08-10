-- ===========================================================================
--  THE PRICES IN THIS DATABASE WERE ALWAYS LEI. SAY SO.
-- ===========================================================================
--
--  RUN THIS ONE. DO NOT RUN RUN_CURRENCY_RON.sql.
--
--  Those two files are alternatives, not steps, and running the wrong one is
--  not recoverable by running the other.
--
--  ---------------------------------------------------------------------------
--  Which one is yours
--  ---------------------------------------------------------------------------
--  RUN_CURRENCY_RON.sql converts a catalogue whose `price_cents` genuinely
--  holds USD cents into bani, by multiplying every amount by 4.6.
--
--  This catalogue does not hold USD cents. `products.price_cents` is written by
--  exactly one screen — the sell form — which takes a number typed by a
--  Romanian seller and multiplies it by 100. A seller who types 360 means 360
--  lei, and the row holds 36000 bani. Nothing in this product has ever asked
--  anybody for a price in dollars.
--
--  The proof was visible on the site: a listing created at 360 displayed at
--  ~1656, which is 360 x 4.6 — the display conversion applied to a number that
--  was already lei. The catalogue was never USD-denominated; the reader was
--  wrong about what it was reading, and that reader has been fixed.
--
--  So there is nothing to convert. Multiplying by 4.6 now would take a
--  correctly-priced catalogue and make every item 4.6x too expensive,
--  permanently, in the data rather than on the screen.
--
--  ---------------------------------------------------------------------------
--  What this file does
--  ---------------------------------------------------------------------------
--  It changes no prices. It creates the marker table if it is not there and
--  writes one row recording the fact above, because lib/checkout/currency-guard
--  refuses to build a lei PaymentIntent until the stored unit has been stated
--  in the database. Stating it is the entire job.
--
--  Safe to run twice: the insert is a no-op the second time.

create table if not exists public.platform_migrations (
  key         text primary key,
  detail      text,
  applied_at  timestamptz not null default now()
);

insert into public.platform_migrations (key, detail)
values (
  'currency_ron_native',
  'products.price_cents has always held bani: written by the sell form as seller-typed lei x 100. No conversion performed or needed.'
)
on conflict (key) do nothing;

-- What you should see: one row, and no price anywhere changed.
select key, detail, applied_at
  from public.platform_migrations
 where key in ('currency_ron_native', 'currency_ron_2026');

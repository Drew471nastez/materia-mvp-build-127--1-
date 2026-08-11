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

--  ---------------------------------------------------------------------------
--  THE COLUMN IS `note`, AND THE TABLE MAY ALREADY EXIST
--  ---------------------------------------------------------------------------
--  This file first shipped writing a column called `detail`, which does not
--  exist. `create table if not exists` is a no-op against a table that is
--  already there, so it silently did nothing and the insert then failed on a
--  column name that had been invented rather than read.
--
--  The shape below is copied from RUN_CURRENCY_RON.sql, which is the only thing
--  in this repository that creates this table — so on any database where that
--  file has been opened, this is the shape that is really there.
--
--  ---------------------------------------------------------------------------
--  BEFORE RUNNING THIS, CHECK WHETHER THE CONVERSION ALREADY HAPPENED
--  ---------------------------------------------------------------------------
--  The existence of the table means RUN_CURRENCY_RON.sql has been executed at
--  least as far as its first statement. Whether its conversion APPLIED is a
--  different question, answered by the marker row:
--
--    select key, applied_at, note from public.platform_migrations;
--
--  If `currency_ron_2026` is there, prices have already been multiplied by 4.6
--  and the premise of this file is wrong — stop, and work out which rows are in
--  which unit before writing anything. If it is not there, the conversion never
--  applied and the catalogue is native lei, which is what this records.

create table if not exists public.platform_migrations (
  key text primary key,
  applied_at timestamptz not null default now(),
  note text
);

-- Refuses to make the claim if the conversion marker is present, rather than
-- recording two contradictory statements about the same catalogue.
do $$
begin
  if exists (select 1 from public.platform_migrations where key = 'currency_ron_2026') then
    raise exception
      'currency_ron_2026 is present: prices were converted from USD at 4.6. This file claims the opposite and must not run. Check which unit the rows are actually in.';
  end if;

  insert into public.platform_migrations (key, note)
  values (
    'currency_ron_native',
    'products.price_cents has always held bani: written by the sell form as seller-typed lei x 100. No conversion performed or needed.'
  )
  on conflict (key) do nothing;
end $$;

-- What you should see: one row, currency_ron_native, and no price changed.
select key, applied_at, note
  from public.platform_migrations
 where key in ('currency_ron_native', 'currency_ron_2026');

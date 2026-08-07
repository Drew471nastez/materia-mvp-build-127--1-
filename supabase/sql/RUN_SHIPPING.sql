-- ===========================================================================
--  SHIPPING / AWB — additive columns on public.orders
-- ===========================================================================
--  Run this in the Supabase SQL editor. Safe to run more than once.
--
--  ADDITIVE ONLY. Nothing existing is renamed, moved or dropped: every column
--  below is new and nullable, so an order that predates shipping reads exactly
--  as it did and every existing query keeps working untouched.
--
--  WHY THESE COLUMNS AND NOT OTHERS
--  `orders` already carries buyer_first_name, buyer_last_name and buyer_email —
--  those are NOT duplicated here. What it has never carried is where the parcel
--  goes: a marketplace that only sold digital products never needed a street.
--  So the delivery address is the genuinely new information, and the AWB fields
--  are the courier's answer to it.
-- ===========================================================================

-- ── Where the parcel goes ──────────────────────────────────────────────────
-- Captured at checkout, from the buyer. Kept on the ORDER rather than on the
-- profile because an address is a fact about one delivery: people move, and
-- send things to work, and to their mother. An order must always be able to say
-- where it actually went.
alter table public.orders
  add column if not exists ship_contact      text,
  add column if not exists ship_phone        text,
  add column if not exists ship_country_code text default 'RO',
  add column if not exists ship_county       text,
  add column if not exists ship_locality     text,
  add column if not exists ship_street       text,
  add column if not exists ship_street_no    text,
  add column if not exists ship_details      text,
  add column if not exists ship_postal_code  text,
  -- Locker deliveries: the courier's pickup-point id, when the buyer chose one
  -- instead of a street. Mutually exclusive with the street fields in practice.
  add column if not exists ship_fixed_location_id integer;

-- ── What the courier gave back ─────────────────────────────────────────────
alter table public.orders
  add column if not exists shipping_status        text,
  add column if not exists shipping_provider      text,
  add column if not exists awb_number             text,
  add column if not exists tracking_number        text,
  add column if not exists shipping_label_url     text,
  add column if not exists shipping_carrier       text,
  add column if not exists shipping_service_id    integer,
  add column if not exists shipping_carrier_id    integer,
  add column if not exists shipping_provider_order_id text,
  add column if not exists shipping_cost_cents    integer,
  add column if not exists shipping_created_at    timestamptz,
  add column if not exists shipped_at             timestamptz,
  add column if not exists delivered_at           timestamptz,
  add column if not exists shipping_last_checked_at timestamptz,
  -- The carrier's own words, kept verbatim. Our status vocabulary is a mapping
  -- and mappings are wrong sometimes; without the original there is nothing to
  -- check the mapping against when a shipment behaves oddly.
  add column if not exists shipping_raw_status    text,
  add column if not exists shipping_error         text;

-- ── The idempotency guarantee, in the database ─────────────────────────────
--
-- THE MOST IMPORTANT LINE IN THIS FILE.
--
-- Creating an AWB books a real courier and charges the account, and the
-- provider has no idempotency key — the same POST twice is two shipments. The
-- application checks for an existing AWB before calling, and that check is a
-- read followed by a write, which two concurrent webhook retries can both pass.
--
-- A unique index cannot be raced. Two parallel attempts to attach an AWB to the
-- same order end with one row written and one error, instead of two couriers
-- arriving to collect the same jacket. Partial, so the many orders with no AWB
-- yet do not collide on null.
create unique index if not exists orders_awb_number_key
  on public.orders (awb_number)
  where awb_number is not null;

-- Finding the work: orders that are paid and have no AWB yet.
create index if not exists orders_awaiting_awb_idx
  on public.orders (created_at desc)
  where awb_number is null;

comment on column public.orders.shipping_status is
  'Marketplace shipping state: awaiting_shipment | awb_created | shipped | in_transit | delivered | shipping_creation_failed. See lib/shipping/status.ts.';
comment on column public.orders.shipping_raw_status is
  'The carrier''s own status string, unmapped. Kept so the mapping can be audited.';

-- ── The delivery point, chosen BEFORE paying ───────────────────────────────
--
-- Vinted asks where the parcel goes before taking the money, and so does
-- Storelib now. But the order does not exist yet at that moment — it is created
-- by the payment flow — so the choice has to live somewhere until there is an
-- order to attach it to. This is that somewhere.
--
-- KEYED BY BUYER, NOT BY ORDER, and deliberately: checkout allows guests, so
-- there may be no user id. A signed-in buyer is matched on user_id; a guest on
-- the email they typed at checkout. Both columns are on `orders` already, so
-- attaching the choice afterwards is a lookup, not a schema change to the
-- payment path — which is the point. Nothing in this feature edits how an order
-- is created.
--
-- It doubles as a remembered address: the second purchase skips the step.
create table if not exists public.buyer_shipping_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  -- The locker, and the network it is on. Both are needed: a locker→locker
  -- shipment requires both ends on one carrier.
  locker_id integer not null,
  carrier_id integer,
  contact text not null,
  phone text not null,
  -- Resolved server-side from the locker id, never taken from the client.
  country_code text default 'RO',
  county text,
  locality text,
  street text,
  street_no text,
  details text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- A buyer has one current delivery point, not a history.
  constraint buyer_shipping_prefs_identified check (user_id is not null or email is not null)
);

-- One row per buyer, so saving is an upsert rather than an ever-growing log.
-- Partial, because the two identities are mutually exclusive in practice.
create unique index if not exists buyer_shipping_prefs_user_key
  on public.buyer_shipping_prefs (user_id) where user_id is not null;
create unique index if not exists buyer_shipping_prefs_email_key
  on public.buyer_shipping_prefs (lower(email)) where email is not null and user_id is null;

-- RLS on, and NO policies: this table is written and read only by the server
-- (service role), which is what lets a guest with no session have a row at all.
-- Without this, RLS-off would leave every buyer's phone number readable with
-- the anon key.
alter table public.buyer_shipping_prefs enable row level security;

comment on table public.buyer_shipping_prefs is
  'Where a buyer wants parcels delivered, chosen before payment. Server-only (service role); see app/api/shipping/preference.';

-- ── Did it work? ───────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
       and column_name in ('awb_number','shipping_status','ship_locality')) as shipping_columns_present,
  (select count(*) from public.orders where awb_number is not null) as orders_with_awb,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'orders_awb_number_key') as idempotency_index_present,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'buyer_shipping_prefs') as prefs_table_present;

-- PostgREST answers from its own cached schema; without this the API keeps
-- reporting "Could not find the 'awb_number' column of 'orders'".
notify pgrst, 'reload schema';

-- THE TABLES PART 78's STOCK FUNCTIONS AND PART 214 TOUCH, AND NOTHING ELSE,
-- for scripts/sql-harness/inventory-race.sh. Column for column what part 78
-- creates for the stock tables; creators, products, variants and checkouts
-- cut down to the columns the functions read. Run as a superuser on an empty
-- database, after supabase-shim.sql made the roles.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.creators (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.products (id uuid primary key default gen_random_uuid(), creator_id uuid references public.creators(id) on delete cascade, type text not null default 'physical', title text not null default 'P', track_inventory boolean, continue_selling boolean, low_stock_threshold integer);
create table public.product_variants (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, name text not null default 'Default', track_inventory boolean, inventory_policy text not null default 'deny', active boolean not null default true);
create table public.inventory_locations (id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id) on delete cascade, name text not null);
create table public.inventory_levels (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  on_hand integer not null default 0 check (on_hand between -1000000000 and 1000000000),
  committed integer not null default 0 check (committed between 0 and 1000000000),
  incoming integer not null default 0 check (incoming between 0 and 1000000000),
  available integer generated always as (on_hand - committed) stored,
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id)
);
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  creator_id uuid references public.creators(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  delta_on_hand integer not null default 0,
  delta_committed integer not null default 0,
  delta_incoming integer not null default 0,
  on_hand_after integer,
  committed_after integer,
  incoming_after integer,
  reason text not null check (reason in ('initial', 'received', 'correction', 'count', 'damaged', 'theft_or_loss', 'promotion_or_donation', 'returned_restock', 'sale_fulfilled', 'order_reserved', 'reservation_released', 'order_cancelled', 'transfer_out', 'transfer_in', 'incoming_added', 'incoming_cancelled', 'provider_sync')),
  ref_type text,
  ref_id text,
  note text,
  actor text not null default 'system' check (actor in ('creator', 'buyer', 'system', 'webhook', 'admin')),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create table public.commerce_checkouts (id uuid primary key default gen_random_uuid(), creator_id uuid references public.creators(id) on delete set null, status text not null default 'pending', updated_at timestamptz not null default now());
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.commerce_checkouts(id) on delete cascade,
  creator_id uuid references public.creators(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  quantity integer not null check (quantity between 1 and 100000),
  status text not null default 'held',
  fulfilled_quantity integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (checkout_id, variant_id, location_id)
);
create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  origin_location_id uuid references public.inventory_locations(id) on delete set null,
  destination_location_id uuid references public.inventory_locations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'in_transit', 'partially_received', 'received', 'cancelled')),
  reference text, note text, expected_at date, shipped_at timestamptz, received_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null check (quantity between 1 and 1000000),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  unique (transfer_id, variant_id),
  constraint inventory_transfer_items_received check (received_quantity <= quantity)
);
alter table public.inventory_levels enable row level security;
alter table public.inventory_movements enable row level security;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to authenticated;

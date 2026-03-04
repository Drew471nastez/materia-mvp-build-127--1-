-- Coupons table for creator discount codes
create table if not exists public.coupons (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators(id) on delete cascade,
  code            text not null,
  discount_type   text not null check (discount_type in ('percentage', 'fixed')),
  discount_value  numeric(10,2) not null check (discount_value > 0),
  -- NULL means applies to all products; array of product IDs means specific products
  product_ids     uuid[],
  usage_limit     integer, -- NULL = unlimited
  usage_count     integer not null default 0,
  starts_at       timestamptz,
  expires_at      timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Enforce uniqueness per creator (case-insensitive via index below)
  unique (creator_id, code)
);

-- Case-insensitive unique index so "SUMMER10" and "summer10" are the same
create unique index if not exists coupons_creator_code_ci
  on public.coupons (creator_id, lower(code));

-- Index for fast validate lookups
create index if not exists coupons_code_active
  on public.coupons (lower(code), is_active, creator_id);

-- Auto-update updated_at
create or replace function public.set_coupons_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coupons_updated_at on public.coupons;
create trigger coupons_updated_at
  before update on public.coupons
  for each row execute procedure public.set_coupons_updated_at();

-- RLS
alter table public.coupons enable row level security;

-- Creators can only see/manage their own coupons
create policy "Creators manage own coupons" on public.coupons
  for all
  using (
    creator_id in (
      select id from public.creators where user_id = auth.uid()
    )
  )
  with check (
    creator_id in (
      select id from public.creators where user_id = auth.uid()
    )
  );

-- Public validate endpoint needs read access (enforced at API layer)
create policy "Public read active coupons" on public.coupons
  for select
  using (is_active = true);

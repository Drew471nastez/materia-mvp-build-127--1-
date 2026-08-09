-- ===========================================================================
--  ONE BUYER AT A TIME
-- ===========================================================================
--
--  WHAT THIS FIXES
--  A listing is one physical object. Two people reaching the pay button in the
--  same second both had their card charged: the guard that refuses a
--  second sale READS the orders table, and neither order exists yet at the
--  moment the other one checks. Two charges, one jacket, one refund and an
--  apology.
--
--  A read-then-write cannot fix that. Something has to make Postgres pick.
--
--  HOW IT WORKS
--  A primary key on product_id, so the table can hold AT MOST ONE live
--  reservation per listing. Claiming is one INSERT … ON CONFLICT, which is
--  atomic: of two requests arriving together, exactly one comes back holding
--  the row and the other comes back empty. No advisory locks, no polling, no
--  second source of truth about who is buying what.
--
--  Reservations expire on their own — see the function — so an abandoned
--  checkout frees the listing after fifteen minutes with nothing to sweep.
--
--  SAFE TO RUN MORE THAN ONCE. Everything here is create-if-not-exists or
--  create-or-replace.
--
--  UNTIL IT IS RUN, nothing breaks: lib/marketplace/reservation.ts treats a
--  missing function as "could not reserve, carry on", so checkout behaves
--  exactly as it does today and the race stays open until you run this.
-- ===========================================================================

create table if not exists public.product_reservations (
  -- THE WHOLE MECHANISM. One row per listing, enforced by Postgres.
  product_id uuid primary key references public.products(id) on delete cascade,
  -- A signed-in buyer's user id, or the PaymentIntent id for a guest. Only ever
  -- compared for equality, so a buyer refreshing the checkout re-takes their
  -- own reservation instead of colliding with it.
  buyer_key text not null,
  payment_intent_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Expiry is looked up on every claim.
create index if not exists product_reservations_expires_idx
  on public.product_reservations (expires_at);

-- Server-only. There is nothing here a browser should read: it would say which
-- listings somebody is midway through buying, which is neither useful nor
-- anybody's business. RLS on with no policies means the service role is the
-- only way in, which is the same shape as buyer_shipping_prefs.
alter table public.product_reservations enable row level security;

-- ---------------------------------------------------------------------------
--  THE CLAIM
-- ---------------------------------------------------------------------------
--  Returns true if the caller now holds the listing, false if somebody else
--  does. One statement, so the decision is Postgres's and not the caller's.
--
--  The ON CONFLICT branch takes the row when — and only when — the existing
--  reservation has expired, or it already belongs to this same buyer. That
--  second case matters: a buyer who reloads the checkout, or whose first
--  PaymentIntent failed, must be able to carry on rather than be locked out by
--  their own abandoned attempt.
create or replace function public.claim_product_reservation(
  p_product_id uuid,
  p_buyer_key text,
  p_intent text default null,
  p_minutes int default 15
) returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.product_reservations (product_id, buyer_key, payment_intent_id, expires_at)
  values (p_product_id, p_buyer_key, p_intent, now() + make_interval(mins => greatest(1, p_minutes)))
  on conflict (product_id) do update
    set buyer_key = excluded.buyer_key,
        payment_intent_id = excluded.payment_intent_id,
        expires_at = excluded.expires_at,
        created_at = now()
    where product_reservations.expires_at < now()
       or product_reservations.buyer_key = excluded.buyer_key
  returning true;
$$;

-- ---------------------------------------------------------------------------
--  THE RELEASE
-- ---------------------------------------------------------------------------
--  Called when the sale completes (the listing is marked sold, so the row is
--  just clutter) and when a payment fails (so the next person can buy it
--  without waiting out the fifteen minutes).
--
--  Scoped to the holder: a request cannot release somebody else's claim, which
--  would otherwise be a one-line way to snipe an item out from under whoever is
--  paying for it.
create or replace function public.release_product_reservation(
  p_product_id uuid,
  p_buyer_key text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.product_reservations
   where product_id = p_product_id
     and buyer_key = p_buyer_key;
$$;

revoke all on function public.claim_product_reservation(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.release_product_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_product_reservation(uuid, text, text, int) to service_role;
grant execute on function public.release_product_reservation(uuid, text) to service_role;

-- Did it work?
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'product_reservations') as table_present,
  (select count(*) from pg_proc where proname = 'claim_product_reservation') as claim_present,
  (select count(*) from pg_proc where proname = 'release_product_reservation') as release_present;

notify pgrst, 'reload schema';

-- =============================================================================
--  BUSINESS ACCOUNTS: ONE LOGIN, UP TO TWO BUSINESSES
-- =============================================================================
-- A person signs in once and can run a second business beside their first,
-- the way one Shopify login reaches more than one store. The second business
-- is its own account underneath: its own profile, creator row, creator page,
-- website, OnePage, products, orders, emails, payouts and Stripe account.
-- Nothing in the app had to learn about "which business" because of that:
-- every table is already keyed by the account (auth.uid()) or by the creator
-- row that account owns, and row level security already scopes every read to
-- auth.uid(). Two accounts are isolated by the same rules that isolate two
-- strangers.
--
-- What is new is the link between them, below, and a server route that
-- switches the session from one to the other after checking it. The second
-- account has no password anyone knows and cannot be signed into directly:
-- the only way in is from the first account's session.
--
-- Run as part 26 in supabase/sql/run-now (the same statements, one per line).

-- The link. `member_id` is the second business; `owner_id` is the login that
-- made it. One member per owner is the "two businesses" limit, enforced here
-- rather than trusted to the route.
create table if not exists public.business_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint business_links_pkey primary key (member_id),
  constraint business_links_one_per_owner unique (owner_id),
  constraint business_links_not_self check (owner_id <> member_id)
);

-- Read by the two accounts it links (the account menu lists both), written
-- only by the server with the service role. No insert, update or delete
-- policy exists, so row level security refuses every write from a browser.
alter table public.business_links enable row level security;
drop policy if exists business_links_read on public.business_links;
create policy business_links_read on public.business_links for select using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);
revoke insert, update, delete on public.business_links from anon, authenticated;

-- No chains: a second business cannot own a third, and a login that owns a
-- business cannot itself be made somebody's second business.
create or replace function public.business_links_no_chain() returns trigger language plpgsql security definer set search_path = public as $$ begin if exists (select 1 from public.business_links where member_id = new.owner_id) then raise exception 'A business account cannot own another business'; end if; if exists (select 1 from public.business_links where owner_id = new.member_id) then raise exception 'An account that owns a business cannot be added as one'; end if; return new; end; $$;
drop trigger if exists business_links_no_chain on public.business_links;
create trigger business_links_no_chain before insert or update on public.business_links for each row execute function public.business_links_no_chain();

-- Every switch, for support and for spotting anything odd. Server only:
-- row level security on and no policy, so no browser can read or write it.
create table if not exists public.business_switches (
  id bigint generated always as identity primary key,
  from_user uuid not null,
  to_user uuid not null,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);
alter table public.business_switches enable row level security;
revoke all on public.business_switches from anon, authenticated;
create index if not exists business_switches_from_created on public.business_switches (from_user, created_at desc);

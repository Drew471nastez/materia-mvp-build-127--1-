/* BUSINESSES, COMPLETE: EVERYTHING UP TO THREE BUSINESSES ON ONE LOGIN RELIES ON, IN ONE PLACE. */
/* The feature was made in two steps: 20261001_business_accounts.sql (run-now part 26: the link, one business beside the first, no chains, the switch log) and 20261006_business_limit_three.sql (part 38: three in all, counted by a trigger under a lock). The owner asked for one complete part to run for all of it, so a database gets there from any of three places: nothing run, part 26 run, or parts 26 and 38 run. */
/* How it is built: a business after the first is an auth account of its own (lib/businesses/server createBusinessAccount), with the owner's address and a tag, a password nobody holds, linked here to the login's first business. Everything a business owns (its creator row, products, orders, pages, domains, Stripe account, emails) is keyed by that account, so the row level security that keeps any two accounts apart keeps two businesses apart; nothing here copies or shares a row between them. The app reads and writes this table with the service key only, after checking the caller's group on the server (lib/businesses/rules maySwitch, app/api/businesses/switch). */
/* The limit, three, is MAX_BUSINESSES in lib/businesses/rules.ts; tests/business-accounts.test.ts fails if the number here ever differs. */
/* Differences from parts 26 and 38, all tightening: anon loses every grant on business_links (it could never read a row, RLS saw to that, but it held the grant), authenticated keeps select and loses truncate, references and trigger as well as the writes part 26 took (truncate skips row level security), the two trigger functions can no longer be called directly (a trigger does not need that grant to fire; checked on a scratch database), and the rate limit table is the server's only. */
/* Before this runs the app works as it did: with part 26 alone a third business is refused and the menu says it cannot be added just yet (LIMIT_NOT_OPEN_YET); with neither, New business says businesses are not set up on this database yet, and the menu shows the one account. */
/* Run as a run-now part (the same statements, one per line). Safe to run twice. Changes no rows. */

/* The link: one row per business after the first, owner_id the login's first business, member_id the business it made. A business belongs to one login (member_id is the key), is never its own, and goes when either account is deleted. */
create table if not exists public.business_links (owner_id uuid not null references auth.users(id) on delete cascade, member_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), constraint business_links_pkey primary key (member_id), constraint business_links_not_self check (owner_id <> member_id));
alter table public.business_links drop constraint if exists business_links_not_self;
alter table public.business_links add constraint business_links_not_self check (owner_id <> member_id) not valid;
alter table public.business_links validate constraint business_links_not_self;
create index if not exists business_links_owner_created on public.business_links (owner_id, created_at);

/* Read only by the two accounts a row links; nothing a browser can write. The server writes with the service key. */
alter table public.business_links enable row level security;
drop policy if exists business_links_read on public.business_links;
create policy business_links_read on public.business_links for select using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);
revoke all on public.business_links from anon;
revoke insert, update, delete, truncate, references, trigger on public.business_links from authenticated;
grant select on public.business_links to authenticated;
grant all on public.business_links to service_role;

/* No chains: a business never owns one of its own, and a login's first business is never made a business of another. */
create or replace function public.business_links_no_chain() returns trigger language plpgsql security definer set search_path = public as $$ begin if exists (select 1 from public.business_links where member_id = new.owner_id) then raise exception 'A business account cannot own another business'; end if; if exists (select 1 from public.business_links where owner_id = new.member_id) then raise exception 'An account that owns a business cannot be added as one'; end if; return new; end; $$;
drop trigger if exists business_links_no_chain on public.business_links;
create trigger business_links_no_chain before insert or update on public.business_links for each row execute function public.business_links_no_chain();

/* Three businesses a login, its first included: the same number as MAX_BUSINESSES in lib/businesses/rules.ts. A lock per login makes two inserts at once take turns, so both cannot see room for one. Refused as check_violation (23514), which the app reads as the limit. */
create or replace function public.business_links_limit() returns trigger language plpgsql security definer set search_path = public as $$ begin perform pg_advisory_xact_lock(hashtextextended('business_links ' || new.owner_id::text, 0)); if 1 + (select count(*) from public.business_links where owner_id = new.owner_id and member_id <> new.member_id) >= 3 then raise exception 'One login can have at most 3 businesses' using errcode = 'check_violation', constraint = 'business_links_limit'; end if; return new; end; $$;
drop trigger if exists business_links_limit on public.business_links;
create trigger business_links_limit before insert or update of owner_id, member_id on public.business_links for each row execute function public.business_links_limit();

/* The old one business per login key from part 26 goes, now that the trigger above counts to three. */
alter table public.business_links drop constraint if exists business_links_one_per_owner;

/* The two trigger functions run as triggers only: nobody calls them through the API. */
revoke all on function public.business_links_no_chain() from public, anon, authenticated;
revoke all on function public.business_links_limit() from public, anon, authenticated;

/* Every switch, for support: who from, who to, when, from where. Server only; the app never reads it. */
create table if not exists public.business_switches (id bigint generated always as identity primary key, from_user uuid not null, to_user uuid not null, created_at timestamptz not null default now(), ip text, user_agent text);
alter table public.business_switches enable row level security;
revoke all on public.business_switches from anon, authenticated;
grant all on public.business_switches to service_role;
create index if not exists business_switches_from_created on public.business_switches (from_user, created_at desc);

/* The rate limit counter the switch (twenty a minute) and create (three an hour) routes count in, as part 01 makes it. Server only. */
create table if not exists public.rate_limit_hits (id bigserial primary key, bucket text not null, subject text not null, created_at timestamptz not null default now());
create index if not exists rate_limit_hits_lookup on public.rate_limit_hits (bucket, subject, created_at desc);
create index if not exists rate_limit_hits_sweep on public.rate_limit_hits (created_at);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
grant all on public.rate_limit_hits to service_role;
do $$ begin if to_regclass('public.rate_limit_hits_id_seq') is not null then grant usage, select on sequence public.rate_limit_hits_id_seq to service_role; end if; end $$;

/* The API sees the change at once. */
notify pgrst, 'reload schema';

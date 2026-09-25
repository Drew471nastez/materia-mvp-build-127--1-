/* Business accounts: one login, up to two businesses. The link between a login and its second business (one per login, no chains, read by the two accounts it links, written by the server only), and a server only log of every switch. Needs nothing else. Reasons: supabase/migrations/20261001_business_accounts.sql. */
create table if not exists public.business_links (owner_id uuid not null references auth.users(id) on delete cascade, member_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), constraint business_links_pkey primary key (member_id), constraint business_links_one_per_owner unique (owner_id), constraint business_links_not_self check (owner_id <> member_id));
alter table public.business_links enable row level security;
drop policy if exists business_links_read on public.business_links;
create policy business_links_read on public.business_links for select using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);
revoke insert, update, delete on public.business_links from anon, authenticated;
create or replace function public.business_links_no_chain() returns trigger language plpgsql security definer set search_path = public as $$ begin if exists (select 1 from public.business_links where member_id = new.owner_id) then raise exception 'A business account cannot own another business'; end if; if exists (select 1 from public.business_links where owner_id = new.member_id) then raise exception 'An account that owns a business cannot be added as one'; end if; return new; end; $$;
drop trigger if exists business_links_no_chain on public.business_links;
create trigger business_links_no_chain before insert or update on public.business_links for each row execute function public.business_links_no_chain();
create table if not exists public.business_switches (id bigint generated always as identity primary key, from_user uuid not null, to_user uuid not null, created_at timestamptz not null default now(), ip text, user_agent text);
alter table public.business_switches enable row level security;
revoke all on public.business_switches from anon, authenticated;
create index if not exists business_switches_from_created on public.business_switches (from_user, created_at desc);

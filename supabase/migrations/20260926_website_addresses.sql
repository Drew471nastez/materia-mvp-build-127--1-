-- ===========================================================================
--  A WEBSITE'S OWN STORELIB ADDRESS, APART FROM ITS CREATOR'S USERNAME
-- ===========================================================================
--  The same as supabase/sql/RUN_WEBSITE_ADDRESSES.sql, for `supabase db push`.
--  Safe to run more than once.
--
--  A website is at <username>.storelib.com until its creator chooses another
--  name in Website Settings › Domains. The chosen name is here, one per
--  creator; a name they move away from is kept in the history, still
--  answering for their site, so links already given out keep working and
--  nobody else can take it over.
--
--  Until this has been run, Website Settings says the address cannot be
--  changed yet, and every site stays at its username. Nothing else depends
--  on it.
-- ===========================================================================

create table if not exists public.website_addresses (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_address_history (
  handle text primary key check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  creator_id uuid not null references public.creators(id) on delete cascade,
  retired_at timestamptz not null default now()
);

create index if not exists website_address_history_creator on public.website_address_history (creator_id);

alter table public.website_addresses enable row level security;
alter table public.website_address_history enable row level security;

drop policy if exists "creators read their own website address" on public.website_addresses;
create policy "creators read their own website address"
  on public.website_addresses for select
  to authenticated
  using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));

-- No insert, update or delete policy: only the server writes, through the
-- service role, after checking the name is free (app/api/website-address).
revoke insert, update, delete on public.website_addresses from anon, authenticated;
revoke all on public.website_address_history from anon, authenticated;

-- Whether a website already answers to this name, now or from before. Asked
-- by the username form, so a new username never takes a website's address;
-- a yes or a no, and nothing about whose it is.
create or replace function public.website_handle_taken(p_handle text, p_creator uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.website_addresses where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator))
      or exists (select 1 from public.website_address_history where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator));
$$;

revoke all on function public.website_handle_taken(text, uuid) from public;
grant execute on function public.website_handle_taken(text, uuid) to authenticated;

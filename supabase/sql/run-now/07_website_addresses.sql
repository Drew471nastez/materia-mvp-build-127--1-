/* A website's own storelib.com address, apart from the username, and the names it used before. */
create table if not exists public.website_addresses ( creator_id uuid primary key references public.creators(id) on delete cascade, handle text not null unique check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'), updated_at timestamptz not null default now() );
create table if not exists public.website_address_history ( handle text primary key check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'), creator_id uuid not null references public.creators(id) on delete cascade, retired_at timestamptz not null default now() );
create index if not exists website_address_history_creator on public.website_address_history (creator_id);
alter table public.website_addresses enable row level security;
alter table public.website_address_history enable row level security;
drop policy if exists "creators read their own website address" on public.website_addresses;
create policy "creators read their own website address" on public.website_addresses for select to authenticated using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));
revoke insert, update, delete on public.website_addresses from anon, authenticated;
revoke all on public.website_address_history from anon, authenticated;
create or replace function public.website_handle_taken(p_handle text, p_creator uuid default null) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.website_addresses where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator)) or exists (select 1 from public.website_address_history where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator)); $$;
revoke all on function public.website_handle_taken(text, uuid) from public;
grant execute on function public.website_handle_taken(text, uuid) to authenticated;
notify pgrst, 'reload schema';

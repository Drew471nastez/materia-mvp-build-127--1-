-- WHAT PRODUCTION HAS THAT NO FILE IN THE REPOSITORY CREATES.
-- supabase/sql/run-now/README.md names them: public.onepages and
-- public.library_items (tables made in the dashboard), public.exec_sql and
-- public.generate_onepage_slug (functions made in the dashboard). Their real
-- shape is not in the repository, so these follow what the app reads and
-- writes (lib/onepage/types.ts OnePage, lib/account/delete-account.ts) and
-- what the older scripts assume (scripts/031 references onepages(id),
-- migrations/20240001 constrains onepages.owner_id and library_items.user_id).
-- onboarding_completed and share_image_mode are left out on purpose:
-- scripts/033 and part 57 add them.
create table if not exists public.onepages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid,
  slug text not null unique,
  title text not null default '',
  bio text not null default '',
  avatar_url text,
  avatar_video_url text,
  avatar_video_crop jsonb,
  theme jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  draft_blocks jsonb not null default '[]'::jsonb,
  published_blocks jsonb,
  published_theme jsonb,
  published_profile jsonb,
  published_social_links jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.onepages enable row level security;
drop policy if exists "Owners manage their onepage" on public.onepages;
create policy "Owners manage their onepage" on public.onepages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Anyone reads a published onepage" on public.onepages;
create policy "Anyone reads a published onepage" on public.onepages for select using (status = 'published');

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid,
  order_id uuid,
  created_at timestamptz not null default now()
);
alter table public.library_items enable row level security;
drop policy if exists "Buyers read their library" on public.library_items;
create policy "Buyers read their library" on public.library_items for select using (user_id = auth.uid());

create or replace function public.exec_sql(query text) returns void language plpgsql security definer as $$ begin execute query; end $$;

create or replace function public.generate_onepage_slug(base_slug text) returns text language plpgsql as $$
declare candidate text := lower(base_slug); n int := 1;
begin
  while exists (select 1 from public.onepages where lower(slug) = candidate) loop
    n := n + 1; candidate := lower(base_slug) || n::text;
  end loop;
  return candidate;
end $$;

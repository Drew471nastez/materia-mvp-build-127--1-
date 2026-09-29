-- Public member profiles (@handle): who follows whom on Storelib.
-- Run once on the project. Safe to re-run (IF NOT EXISTS).

create table if not exists public.profile_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint profile_follows_not_self check (follower_id <> following_id)
);

create index if not exists idx_profile_follows_following on public.profile_follows (following_id);
create index if not exists idx_profile_follows_follower on public.profile_follows (follower_id);

alter table public.profile_follows enable row level security;

drop policy if exists "profile_follows_read" on public.profile_follows;
create policy "profile_follows_read" on public.profile_follows
  for select using (true);

drop policy if exists "profile_follows_insert_own" on public.profile_follows;
create policy "profile_follows_insert_own" on public.profile_follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "profile_follows_delete_own" on public.profile_follows;
create policy "profile_follows_delete_own" on public.profile_follows
  for delete using (auth.uid() = follower_id);

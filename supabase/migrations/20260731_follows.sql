-- ============================================================================
-- storelib — the follow graph
--
-- Backs the Following tab in the mobile feed and the Follow control on each
-- listing. Safe to run more than once.
--
-- A follow points at a PROFILE (which is an auth user), not at a creator row.
-- Sellers are reached through creators, but a person is the thing you follow —
-- that way the People results in search can use exactly the same button, and a
-- seller who later gains or changes a creator row keeps their followers.
-- ============================================================================

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Following yourself is never meaningful and would pollute follower counts.
  constraint follows_no_self check (follower_id <> following_id),
  -- Makes a follow idempotent: the API can upsert without racing itself when a
  -- button is double-tapped.
  constraint follows_unique unique (follower_id, following_id)
);

-- "Who do I follow" (the Following feed, and hydrating button state).
create index if not exists idx_follows_follower_id on public.follows (follower_id);
-- "How many follow them" (follower counts on a profile).
create index if not exists idx_follows_following_id on public.follows (following_id);

alter table public.follows enable row level security;

-- The graph is public, the same way follower counts are public on any
-- marketplace: anyone may read it, but you may only ever add or remove your own
-- follows. follower_id is never taken from the request body.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows for select
  using (true);

drop policy if exists "users insert their own follows" on public.follows;
create policy "users insert their own follows"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "users delete their own follows" on public.follows;
create policy "users delete their own follows"
  on public.follows for delete
  using (auth.uid() = follower_id);

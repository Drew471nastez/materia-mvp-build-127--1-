-- ============================================================================
-- storelib — last-seen presence
--
-- Backs the online/offline dot on the Following list. Deliberately a single
-- timestamp rather than a realtime presence channel: the dot only needs to say
-- "around recently", and a column costs nothing to read alongside the profile
-- rows we already fetch. Safe to run more than once.
-- ============================================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Read as part of "who do I follow", so it's worth an index once follow lists
-- get long enough to sort or filter on.
create index if not exists idx_profiles_last_seen_at
  on public.profiles (last_seen_at desc nulls last);

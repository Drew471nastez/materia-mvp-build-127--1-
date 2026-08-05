-- ===========================================================================
--  Storelib — profile covers and bios
-- ===========================================================================
--  Run this once in the Supabase SQL editor. It is idempotent: running it a
--  second time changes nothing and raises nothing.
--
--  What it adds
--  ------------
--    profiles.bio        the line under your name on your profile
--    profiles.cover_url  the band of colour or photograph behind it
--
--  Until this has run, the profile still works: /api/profile answers 409 with
--  `missingColumns` and the editor says so plainly rather than failing, and
--  every profile shows the preset cover its account id resolves to. See
--  lib/profile/covers.ts.
-- ===========================================================================

-- ── The columns ────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists cover_url text;

comment on column public.profiles.bio is
  'Free text shown under the display name on the profile. Capped at 240 characters by the application.';

comment on column public.profiles.cover_url is
  'NULL = the preset chosen from the account id; "preset:<id>" = a preset picked deliberately; an https URL = an uploaded image. See lib/profile/covers.ts.';

-- ── A ceiling the database keeps too ───────────────────────────────────────
--  The API trims to 240 before writing, and PostgREST is reachable without
--  going through the API at all — so the app's limit is not the last word. A
--  check constraint is: it costs nothing on every write and it cannot be
--  bypassed by anything holding a session token.
--
--  Written as a DO block because `add constraint if not exists` does not exist
--  for check constraints, and a plain ALTER would fail on the second run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_bio_length'
  ) then
    alter table public.profiles
      add constraint profiles_bio_length check (bio is null or char_length(bio) <= 400);
  end if;
end $$;

--  400 rather than 240 on purpose. The application's limit is a product
--  decision that may move; this one is an abuse ceiling, and a constraint that
--  sits exactly on the app's limit turns every future copy change into a
--  migration.

-- ── Who may write them ─────────────────────────────────────────────────────
--  Nothing to add if `profiles` already has an owner-scoped update policy,
--  which it does — these are two more columns on a row the owner could already
--  update. Stated here so the next person reading this file does not go looking
--  for a policy that is deliberately absent.
--
--  Reads are likewise unchanged: a profile is public, and a bio and a cover are
--  the two most public things on it.

-- ── The storage the uploads land in ────────────────────────────────────────
--  Covers are written by the service role into the existing public `avatars`
--  bucket under `covers/<user-id>/<timestamp>.<ext>` — see
--  app/api/profile/cover/route.ts. No new bucket and no new policy: the upload
--  never touches storage RLS, because the route proves who the caller is before
--  a single byte is stored, and the object is public afterwards because the
--  page that shows it is.
--
--  If the `avatars` bucket does not exist on this project yet, create it as a
--  PUBLIC bucket:
--
--    insert into storage.buckets (id, name, public)
--    values ('avatars', 'avatars', true)
--    on conflict (id) do nothing;

-- ── Tell PostgREST the table changed ──────────────────────────────────────
--  This line is not optional, and leaving it out is a very confusing five
--  minutes. PostgREST answers the API from its OWN cached picture of the
--  schema, and it validates every request against that cache before Postgres is
--  asked anything. A column added by the statements above therefore does not
--  exist as far as the API is concerned until the cache reloads — so a save
--  comes back with
--
--    Could not find the 'bio' column of 'profiles' in the schema cache
--
--  over a column that is demonstrably there in the SQL editor. The cache
--  refreshes on its own eventually; this asks it to do so now.
notify pgrst, 'reload schema';

select 'profiles.bio and profiles.cover_url are ready' as result;

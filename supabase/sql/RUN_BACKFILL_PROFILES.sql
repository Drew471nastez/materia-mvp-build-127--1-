-- ===========================================================================
--  Storelib — give every account the profiles row it should already have
-- ===========================================================================
--  Run this once in the Supabase SQL editor. It is idempotent: accounts that
--  already have a row are left exactly as they are.
--
--  WHY THIS IS NEEDED
--  ------------------
--  A `profiles` row is normally written by a trigger on signup. Accounts made
--  before that trigger existed — or ones where it failed — have none, and
--  nothing in the app noticed, because every screen falls back to the auth user
--  for identity. The profile rendered a name and everything looked fine.
--
--  It stops looking fine the moment something tries to WRITE. `update ... where
--  id = :me` against a row that is not there is not an error: it matches zero
--  rows and reports success. So uploading a picture appeared to work and was
--  gone on the next load, and saving the profile — the one path that checks
--  whether a row actually changed — was the only thing that could tell you
--  anything was wrong.
--
--  The application creates the row itself now (see lib/profile/write.ts), so
--  this is a repair rather than a requirement. Run it and every account is
--  fixed at once, including the ones nobody has noticed yet.
--
--  WHAT IT DOES
--  ------------
--  Inserts one row per auth user that has none. The column list is built from
--  what this database actually has, because a `profiles` table with a NOT NULL
--  `username` and one without are both common and a fixed INSERT would fail on
--  one of them.
-- ===========================================================================

do $$
declare
  has_username boolean;
  has_email    boolean;
  cols text := 'id';
  vals text := 'u.id';
  made int;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
  ) into has_username;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) into has_email;

  -- A handle derived from the id, so it is unique without having to look at
  -- what anybody else has taken. People rename themselves from the app; this
  -- only has to be valid and not collide.
  if has_username then
    cols := cols || ', username';
    vals := vals || ', ''user'' || left(replace(u.id::text, ''-'', ''''), 12)';
  end if;

  if has_email then
    cols := cols || ', email';
    vals := vals || ', u.email';
  end if;

  execute format(
    'insert into public.profiles (%s)
     select %s
     from auth.users u
     left join public.profiles p on p.id = u.id
     where p.id is null
     on conflict (id) do nothing',
    cols, vals
  );

  get diagnostics made = row_count;
  raise notice 'profiles rows created: %', made;
end $$;

-- What is left, if anything. Zero is the answer you want.
select count(*) as accounts_still_without_a_profile
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

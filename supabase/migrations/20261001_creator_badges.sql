-- ===========================================================================
--  Storelib: badges Storelib grants a creator
-- ===========================================================================
--  Idempotent: a second run changes nothing.
--
--  profiles.badges is the list of marks shown beside a creator's name on
--  their creator page and their product pages. Storelib grants them; a
--  creator cannot set their own: nothing in the app writes the column, and
--  the trigger below keeps it from being written through the API. The ids the site knows are in
--  lib/creators/badges.ts, and an id it does not know is simply not shown.
--
--  This is separate from the Pro plan's Verified badge, which is a setting
--  in the creator's page config, and from is_verified / is_staff, which say
--  who an account is rather than what it has earned.
--
--  Until this has been run, lib/creators/badges.ts grants the same badges by
--  username, so nothing waits on it. Running it moves the grant into the
--  table and changes nothing on the page.
-- ===========================================================================

alter table public.profiles
  add column if not exists badges text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- A creator cannot give themselves one
-- ---------------------------------------------------------------------------
-- `profiles` has an owner-scoped update policy, so without this a signed-in
-- creator could write their own badges straight through the API. A column
-- grant cannot stop that while the table grant covers every column, so a
-- trigger keeps the old value for any request made as a signed-in or
-- anonymous user. The SQL editor, the service role and migrations are not
-- those roles, and still grant.
create or replace function public.profiles_keep_badges()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.badges := '{}';
    elsif new.badges is distinct from old.badges then
      new.badges := old.badges;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists profiles_keep_badges on public.profiles;
create trigger profiles_keep_badges
  before insert or update on public.profiles
  for each row execute function public.profiles_keep_badges();

-- Veteran: Luca Dragoste (storelib.com/lucadragoste).
update public.profiles
   set badges = array_append(badges, 'veteran')
 where lower(username) = lower('lucadragoste')
   and not ('veteran' = any(badges));

select username, badges
  from public.profiles
 where cardinality(badges) > 0;

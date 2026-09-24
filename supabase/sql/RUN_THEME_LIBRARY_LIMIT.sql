-- ===========================================================================
--  Storelib: a library keeps five websites, even when two arrive at once
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Adds a trigger; changes
--  no rows.
--
--  Add theme, Duplicate and Import each count a creator's websites before
--  they insert one. Two of them at the same moment both counted 4 and both
--  inserted, and the library held 6. This makes the database the one that
--  says no: before a website is inserted, it takes a lock for that creator
--  (so their inserts are counted one after another, never side by side),
--  counts, and refuses the insert once there are five.
--
--  The five is lib/website-builder/theme-registry.ts THEME_INSTALL_LIMIT;
--  tests/website-builder.test.ts fails if the two ever differ. The refusal's
--  message is 'library_full', which the routes read as a full library and
--  the page opens its sheet for.
--
--  A library that is already over five from before the limit keeps every
--  website it has: only an insert is checked.
-- ===========================================================================

create or replace function public.store_theme_installs_library_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kept integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('store_theme_installs:' || new.creator_id::text, 0));
  select count(*) into kept from public.store_theme_installs where creator_id = new.creator_id;
  if kept >= 5 then
    raise exception 'library_full'
      using errcode = 'P0001',
            hint = 'A library keeps 5 websites. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
create trigger store_theme_installs_library_limit
  before insert on public.store_theme_installs
  for each row execute function public.store_theme_installs_library_limit();

notify pgrst, 'reload schema';

select exists (
  select 1 from pg_trigger
  where tgname = 'store_theme_installs_library_limit' and not tgisinternal
) as trigger_present;

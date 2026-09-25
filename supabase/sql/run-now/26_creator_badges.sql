/* Creator badges Storelib grants (profiles.badges), kept from being written through the API by a trigger, and Veteran for lucadragoste. Safe to run twice. */
alter table public.profiles add column if not exists badges text[] not null default '{}';
create or replace function public.profiles_keep_badges() returns trigger language plpgsql as $$ begin if current_user in ('authenticated', 'anon') then if tg_op = 'INSERT' then new.badges := '{}'; elsif new.badges is distinct from old.badges then new.badges := old.badges; end if; end if; return new; end $$;
drop trigger if exists profiles_keep_badges on public.profiles;
create trigger profiles_keep_badges before insert or update on public.profiles for each row execute function public.profiles_keep_badges();
update public.profiles set badges = array_append(badges, 'veteran') where lower(username) = lower('lucadragoste') and not ('veteran' = any(badges));
notify pgrst, 'reload schema';

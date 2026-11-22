/* Five websites per library, enforced by the database; the privacy switch and code attempt counters. */
create or replace function public.store_theme_installs_library_limit() returns trigger language plpgsql security definer set search_path = public as $$ declare kept integer; begin perform pg_advisory_xact_lock(hashtextextended('store_theme_installs:' || new.creator_id::text, 0)); select count(*) into kept from public.store_theme_installs where creator_id = new.creator_id; if kept >= 7 then raise exception 'library_full' using errcode = 'P0001', hint = 'A library keeps 7 websites. Remove one to add another.'; end if; return new; end; $$;
drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
create trigger store_theme_installs_library_limit before insert on public.store_theme_installs for each row execute function public.store_theme_installs_library_limit();
alter table public.profiles add column if not exists personalized_recommendations boolean not null default true;
alter table public.email_change_codes add column if not exists current_email_code text;
alter table public.email_change_codes add column if not exists attempts integer not null default 0;
alter table public.account_delete_codes add column if not exists attempts integer not null default 0;
notify pgrst, 'reload schema';

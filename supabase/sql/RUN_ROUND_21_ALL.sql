-- ===========================================================================
--  STORELIB: EVERYTHING ROUND 21 NEEDS ON PRODUCTION, IN ONE FILE
-- ===========================================================================
--  Paste all of it into the Supabase SQL editor and press Run. Safe to run
--  twice: every part checks before it creates or changes anything. It
--  deletes no data and changes no existing row, except one backfill noted in
--  part 3, which only happens on a database that never had the column.
--
--    1. A library keeps seven websites, enforced by the database (the limit
--       was five; lib/website-builder/theme-registry.ts THEME_INSTALL_LIMIT).
--    2. Theme releases: the theme_releases table /admin/themes publishes
--       versions into and the library's Update available reads; a
--       description and a phone cover on each marketplace listing.
--    3. profiles.email_verified and email_verified_at, which sign in, the
--       creator pages and guest order linking read. Added only if missing;
--       when added, accounts whose address Supabase Auth already confirmed
--       are marked verified so nobody is sent back to the code screen. Then
--       the guard (part 347) that only the server may set them.
--
--  The last statement answers one row of true/false: every column should be
--  true when the run is done.
-- ===========================================================================

-- ── 1. Seven websites per library ──────────────────────────────────────────
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
  if kept >= 7 then
    raise exception 'library_full'
      using errcode = 'P0001',
            hint = 'A library keeps 7 websites. Remove one to add another.';
  end if;
  return new;
end;
$$;

do $do$ begin
  if to_regclass('public.store_theme_installs') is not null then
    drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
    create trigger store_theme_installs_library_limit
      before insert on public.store_theme_installs
      for each row execute function public.store_theme_installs_library_limit();
  end if;
end $do$;

-- ── 2. Theme releases (supabase/sql/RUN_THEME_RELEASES.sql) ────────────────
create table if not exists public.theme_releases (
  id uuid primary key default gen_random_uuid(),
  target text not null check (target = 'base' or target ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  family text not null check (family ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  version text not null check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  notes text not null default '' check (char_length(notes) <= 4000),
  source text not null check (source in ('zip', 'code')),
  layer text not null default 'theme' check (layer in ('theme', 'overlay')),
  package_path text not null check (package_path ~ '^theme-releases/'),
  manifest jsonb not null default '{}'::jsonb,
  files integer not null default 0 check (files >= 0),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target, version)
);

create index if not exists theme_releases_family_published on public.theme_releases (family, published, created_at desc);

comment on table public.theme_releases is
  'Versions of a theme published from /admin/themes. target: base or a listing address. Read by every creator for its notes; written only by the server.';

alter table public.theme_releases enable row level security;

do $do$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theme_releases' and policyname = 'theme_releases_read_published') then
    create policy theme_releases_read_published on public.theme_releases for select to anon, authenticated using (published);
  end if;
end $do$;

revoke all on public.theme_releases from anon, authenticated;
grant select (id, target, family, version, notes, source, published, published_at, created_at) on public.theme_releases to anon, authenticated;

-- The listings table is part 252's; on a database without it this step waits for it.
do $do$ begin
  if to_regclass('public.theme_marketplace_listings') is not null then
    alter table public.theme_marketplace_listings
      add column if not exists description text check (description is null or char_length(description) <= 600),
      add column if not exists phone_cover_url text;
    comment on column public.theme_marketplace_listings.description is
      'A sentence or two shown under the name on the theme''s page at storelib.com/themes.';
    comment on column public.theme_marketplace_listings.phone_cover_url is
      'The cover at a phone''s width, shown beside the desktop cover.';
  end if;
end $do$;

-- ── 3. profiles.email_verified, and only the server sets it ───────────────
do $do$ begin
  if to_regclass('public.profiles') is null then return; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_verified') then
    alter table public.profiles add column email_verified boolean not null default false;
    -- New column: an address Supabase Auth has already confirmed counts as verified.
    update public.profiles p set email_verified = true
      from auth.users u
      where u.id = p.id and u.email_confirmed_at is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_verified_at') then
    alter table public.profiles add column email_verified_at timestamptz;
    update public.profiles p set email_verified_at = coalesce(u.email_confirmed_at, now())
      from auth.users u
      where u.id = p.id and p.email_verified and p.email_verified_at is null;
  end if;
end $do$;

create or replace function public.profiles_keep_email_verified() returns trigger language plpgsql as $f$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.email_verified := false;
      new.email_verified_at := null;
    else
      new.email_verified := old.email_verified;
      new.email_verified_at := old.email_verified_at;
    end if;
  end if;
  return new;
end $f$;

do $do$ begin
  if to_regclass('public.profiles') is null then return; end if;
  drop trigger if exists profiles_keep_email_verified on public.profiles;
  create trigger profiles_keep_email_verified before insert or update on public.profiles
    for each row execute function public.profiles_keep_email_verified();
end $do$;

notify pgrst, 'reload schema';

-- ── Check: every column true ───────────────────────────────────────────────
select
  exists (select 1 from pg_trigger where tgname = 'store_theme_installs_library_limit' and not tgisinternal)
    and position('kept >= 7' in pg_get_functiondef('public.store_theme_installs_library_limit()'::regprocedure)) > 0 as library_limit_seven,
  to_regclass('public.theme_releases') is not null
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.theme_releases')), false) as theme_releases_with_rls,
  not has_column_privilege('anon', 'public.theme_releases', 'package_path', 'SELECT')
    and has_column_privilege('anon', 'public.theme_releases', 'notes', 'SELECT')
    and not has_table_privilege('authenticated', 'public.theme_releases', 'INSERT') as theme_releases_read_only,
  (to_regclass('public.theme_marketplace_listings') is null
    or (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'theme_marketplace_listings' and column_name in ('description', 'phone_cover_url'))) as listing_description_and_phone_cover,
  (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('email_verified', 'email_verified_at'))
    and exists (select 1 from pg_trigger where tgname = 'profiles_keep_email_verified' and not tgisinternal) as profiles_email_verified;

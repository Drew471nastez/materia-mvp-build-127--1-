-- ===========================================================================
--  Storelib: theme releases, and a description and phone cover per listing
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive: it creates one
--  table, adds two columns, and changes no existing row.
--
--  theme_releases: one row per version of a theme that /admin/themes
--  publishes. `target` is what it updates: 'base' for the shared theme every
--  Storelib template is made from, or a listing's address for one template
--  or one uploaded theme. `family` is the version line it belongs to (the
--  shared theme's package for the base and the templates, the listing's own
--  address for an uploaded theme), so 2.1.0 of the base and 2.1.1 of one
--  template are one numbering. The theme's files are a zip in the private
--  bucket at `package_path`; `manifest` is a hash of every code file of the
--  converted theme, which an update compares with a creator's own files to
--  tell their edits from the theme's.
--
--  Anyone may read the notes of a published release, and only those columns:
--  the zip's path and the manifest stay with the server. Every write is the
--  admin's, through the server (service role).
--
--  theme_marketplace_listings gains `description` (a sentence or two under
--  the name on storelib.com/themes) and `phone_cover_url` (the cover at a
--  phone's width). Until this runs the marketplace reads without them.
-- ===========================================================================

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

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'theme_releases') as releases_table_present,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'theme_marketplace_listings' and column_name in ('description', 'phone_cover_url')) as listing_columns_present;

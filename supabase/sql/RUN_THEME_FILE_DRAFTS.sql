-- ===========================================================================
--  Storelib — a section file is a draft until it is published, and it is kept
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive.
--
--  TWO THINGS WERE WRONG, and they are the same thing twice.
--
--  A section's SETTINGS wait for Publish: they live in draft_sections until
--  somebody puts them live. A section's CODE did not. Saving a file in the
--  code editor changed the live site that second, so a half-written section
--  was on a storefront the moment it compiled, and there was no way to work
--  on one without shipping it.
--
--  And nothing was kept. One column held the file, a save overwrote it, and
--  a mistake made at eleven o'clock could not be undone at noon. Everything
--  else in the builder has history; the files people write had none.
--
--  So: `draft_content` beside `content`, promoted by the same publish that
--  promotes draft_sections, and a row per save in store_theme_file_versions.
--  Until this has run, the routes fall back to what they did before, so
--  neither saving nor publishing depends on it.
-- ===========================================================================

-- ── 1. The unpublished half of a file ──────────────────────────────────────
alter table public.store_theme_custom_files
  add column if not exists draft_content text;

comment on column public.store_theme_custom_files.draft_content is
  'Saved in the code editor and not yet published. The editor renders this; a visitor never does. Null once published, and for a file that has never been edited since.';

-- ── 2. Every save that has ever been made ──────────────────────────────────
create table if not exists public.store_theme_file_versions (
  id          uuid primary key default gen_random_uuid(),
  install_id  uuid not null references public.store_theme_installs(id) on delete cascade,
  path        text not null,
  content     text not null,
  -- What happened: a save, a publish, or a restore of an earlier version.
  kind        text not null default 'save',
  created_at  timestamptz not null default now()
);

create index if not exists idx_stfv_install_path
  on public.store_theme_file_versions(install_id, path, created_at desc);

comment on table public.store_theme_file_versions is
  'Every saved version of every theme file, newest first. Trimmed to the most recent 50 per file by the files route.';

-- ── 3. Only the creator who owns the install ───────────────────────────────
alter table public.store_theme_file_versions enable row level security;

drop policy if exists "creators read their own file versions" on public.store_theme_file_versions;
create policy "creators read their own file versions"
  on public.store_theme_file_versions for select
  using (
    exists (
      select 1
      from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where i.id = store_theme_file_versions.install_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "creators write their own file versions" on public.store_theme_file_versions;
create policy "creators write their own file versions"
  on public.store_theme_file_versions for insert
  with check (
    exists (
      select 1
      from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where i.id = store_theme_file_versions.install_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "creators delete their own file versions" on public.store_theme_file_versions;
create policy "creators delete their own file versions"
  on public.store_theme_file_versions for delete
  using (
    exists (
      select 1
      from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where i.id = store_theme_file_versions.install_id
        and c.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'store_theme_custom_files'
       and column_name = 'draft_content') as draft_column_present,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'store_theme_file_versions') as versions_table_present;

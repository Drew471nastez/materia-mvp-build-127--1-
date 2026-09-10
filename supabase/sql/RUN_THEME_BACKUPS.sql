-- ===========================================================================
--  Storelib — project backups for the website builder
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive: it creates one
--  table and touches nothing else.
--
--  A backup is the whole editable state of one website at one moment: the
--  theme settings and every page's sections, as the editor would show them
--  (draft where a draft exists, otherwise what is live). One row, one JSONB
--  column, so restoring is one read and a handful of writes, and listing
--  never has to load the snapshots themselves.
--
--  Rows are written by the API after it has checked the caller owns the
--  install; RLS below lets a creator read and remove their own, and nobody
--  else's. The API keeps the newest 30 per website and drops the rest, and
--  skips a backup whose contents are identical to the one before it, so a
--  long day of publishing the same thing does not fill the table.
-- ===========================================================================

create table if not exists public.store_theme_backups (
  id           uuid primary key default gen_random_uuid(),
  install_id   uuid not null references public.store_theme_installs(id) on delete cascade,
  label        text not null,
  -- Why it was taken: 'ai' after Storelib AI finished a task, 'publish' when
  -- the site went live, 'manual' from the Backups page, 'restore' for the
  -- safety copy taken just before a restore overwrote the draft.
  source       text not null default 'manual'
               check (source in ('ai', 'publish', 'manual', 'restore')),
  -- { settings: {...}, pages: [{ page_key, sections: [...] }] }
  snapshot     jsonb not null,
  -- sha256 of the snapshot, so an identical state is not stored twice in a row.
  fingerprint  text not null,
  created_at   timestamptz not null default now()
);

comment on table public.store_theme_backups is
  'Point-in-time copies of a website''s editable state. Restoring writes the copy into the draft; nothing goes live until published.';

-- Listing is always "newest first for one website"; this is that query's index.
create index if not exists store_theme_backups_install_created_idx
  on public.store_theme_backups (install_id, created_at desc);

alter table public.store_theme_backups enable row level security;

-- A creator sees the backups of websites they own, through the same chain the
-- other theme tables use: install -> creator -> auth user.
do $pol$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_select_own'
  ) then
    create policy "stb_select_own" on public.store_theme_backups
      for select using (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_insert_own'
  ) then
    create policy "stb_insert_own" on public.store_theme_backups
      for insert with check (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_delete_own'
  ) then
    create policy "stb_delete_own" on public.store_theme_backups
      for delete using (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;
end
$pol$;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'store_theme_backups') as table_present,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'store_theme_backups') as policies_present;

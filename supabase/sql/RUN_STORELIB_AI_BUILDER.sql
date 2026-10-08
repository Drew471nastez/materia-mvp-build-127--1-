-- =============================================================================
--  RUN_STORELIB_AI_BUILDER.sql
--  Storelib AI website builder: the run log, and the page drafts it writes.
-- =============================================================================
--
--  Safe to run more than once. Changes nothing that already exists, deletes
--  nothing, and touches no product, order or payment data.
--
--  1. storelib_ai_runs
--     One row of facts per Storelib AI run in the website builder: the kind of
--     request (rebuild, new page, site-wide), how many changes, which other
--     pages it built as drafts, which checks were still failing, how long it
--     took and which model ran it. Never the words of the request (those stay
--     in theme_chat_messages). Written by
--     app/api/website-builder/themes/[installId]/agent/route.ts through
--     lib/website-builder/agent/run-ledger.ts with the creator's own session,
--     so row-level security decides whose site a row is about. Before this
--     runs, the builder works exactly the same and the rows are simply not
--     kept.
--
--  2. store_theme_pages, read, insert and update by the owner
--     build_page (lib/website-builder/agent/page-builder-server.ts) writes the
--     site's OTHER pages (shop, product page, About, Contact, FAQ...) as
--     drafts with the creator's own session. The website builder migration
--     already gives owners these policies; they are re-asserted here, guarded,
--     for a database that was set up by hand.
--
--  3. store_theme_backups, insert by the owner
--     The first page a run writes takes a backup of the whole site first
--     (lib/website-builder/backups.ts). Re-asserted the same way.
-- =============================================================================

begin;

-- ── 1. storelib_ai_runs ──────────────────────────────────────────────────────
create table if not exists public.storelib_ai_runs (
  id             bigint generated always as identity primary key,
  install_id     uuid not null references public.store_theme_installs(id) on delete cascade,
  creator_id     uuid not null references public.creators(id) on delete cascade,
  page_key       text not null check (char_length(page_key) between 1 and 64),
  status         text not null check (status in ('succeeded', 'failed', 'refused')),
  intent_kind    text,
  intent_flags   jsonb not null default '{}'::jsonb,
  ops_count      integer not null default 0 check (ops_count >= 0),
  wrote_code     boolean not null default false,
  pages_built    text[] not null default '{}',
  unresolved     text[] not null default '{}',
  duration_ms    integer not null default 0 check (duration_ms >= 0),
  model          text,
  provider       text,
  input_tokens   integer not null default 0 check (input_tokens >= 0),
  output_tokens  integer not null default 0 check (output_tokens >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists idx_storelib_ai_runs_install_created
  on public.storelib_ai_runs (install_id, created_at desc);
create index if not exists idx_storelib_ai_runs_creator_created
  on public.storelib_ai_runs (creator_id, created_at desc);
create index if not exists idx_storelib_ai_runs_intent
  on public.storelib_ai_runs (intent_kind, status, created_at desc);

alter table public.storelib_ai_runs enable row level security;

-- A run is facts about what happened: nobody edits or deletes one from the app.
revoke update, delete on public.storelib_ai_runs from anon, authenticated;
revoke all on public.storelib_ai_runs from anon;

drop policy if exists "Creators read their own Storelib AI runs" on public.storelib_ai_runs;
create policy "Creators read their own Storelib AI runs"
  on public.storelib_ai_runs
  for select
  to authenticated
  using (
    creator_id in (select c.id from public.creators c where c.user_id = auth.uid())
  );

drop policy if exists "Creators record runs on their own sites" on public.storelib_ai_runs;
create policy "Creators record runs on their own sites"
  on public.storelib_ai_runs
  for insert
  to authenticated
  with check (
    creator_id in (select c.id from public.creators c where c.user_id = auth.uid())
    and install_id in (
      select sti.id
      from public.store_theme_installs sti
      join public.creators c on c.id = sti.creator_id
      where c.user_id = auth.uid()
    )
  );

grant select, insert on public.storelib_ai_runs to authenticated;

comment on table public.storelib_ai_runs is
  'One row of facts per Storelib AI website builder run (lib/website-builder/agent/run-ledger.ts). No request text.';

-- ── 2. store_theme_pages: the owner writes drafts of every page ─────────────
alter table public.store_theme_pages enable row level security;

do $pages$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_pages' and cmd in ('SELECT', 'ALL')
  ) then
    create policy "stp_select_own" on public.store_theme_pages
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
    where schemaname = 'public' and tablename = 'store_theme_pages' and cmd = 'INSERT'
  ) then
    create policy "stp_insert_own" on public.store_theme_pages
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
    where schemaname = 'public' and tablename = 'store_theme_pages' and cmd = 'UPDATE'
  ) then
    create policy "stp_update_own" on public.store_theme_pages
      for update using (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;
end
$pages$;

-- ── 3. store_theme_backups: the owner takes a restore point first ───────────
do $backups$
begin
  if to_regclass('public.store_theme_backups') is not null then
    execute 'alter table public.store_theme_backups enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'store_theme_backups' and cmd = 'INSERT'
    ) then
      execute $p$
        create policy "Creators back up their own sites" on public.store_theme_backups
          for insert with check (
            install_id in (
              select sti.id from public.store_theme_installs sti
              join public.creators c on c.id = sti.creator_id
              where c.user_id = auth.uid()
            )
          )
      $p$;
    end if;
  else
    raise notice 'store_theme_backups is missing: run supabase/sql/RUN_THEME_BACKUPS.sql, then this file again. Until then build_page refuses to write (no backup, no write).';
  end if;
end
$backups$;

commit;

-- Ask PostgREST to read the new table now rather than on its next restart.
notify pgrst, 'reload schema';

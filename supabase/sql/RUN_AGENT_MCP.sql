-- ===========================================================================
--  MCP PAGE TOOLS: THE BUILDER HEARS AN AGENT'S PAGE CHANGES, AND SAYS WHAT
--  THE CREATOR HAS SELECTED
-- ===========================================================================
--  Paste into the Supabase SQL editor and run. The same as supabase/migrations/20260927_agent_mcp.sql.
--  Safe to run more than once.
--
--  1. theme_agent_activity.detail carries the operations an agent applied to
--     a page, so a builder that is open replays them into what it is showing
--     instead of saving over them. Two new actions: 'page' and 'page_created'.
--  2. theme_editor_focus is the page and section the creator has open in the
--     builder, one row per website, for storelib_read_selected_section.
--
--  Until this has been run the MCP page tools answer that they are not
--  switched on yet and write nothing. Section files work as before.
-- ===========================================================================

alter table public.theme_agent_activity add column if not exists detail jsonb;
alter table public.theme_agent_activity drop constraint if exists theme_agent_activity_action_check;
-- NOT VALID, so the rows already in this log are not rescanned: the check
-- applies to every new row, and adding it does not read a table that only
-- ever grows. The same as the coupons and email flow checks in this round.
alter table public.theme_agent_activity add constraint theme_agent_activity_action_check check (action in ('created', 'updated', 'page', 'page_created')) not valid;

create table if not exists public.theme_editor_focus (
  install_id uuid primary key references public.store_theme_installs(id) on delete cascade,
  page_key text not null check (page_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  section_id text check (section_id is null or char_length(section_id) <= 128),
  block_id text check (block_id is null or char_length(block_id) <= 128),
  updated_at timestamptz not null default now()
);

alter table public.theme_editor_focus enable row level security;
revoke insert, update, delete on public.theme_editor_focus from anon, authenticated;

drop policy if exists "Creators read their own editor focus" on public.theme_editor_focus;
create policy "Creators read their own editor focus" on public.theme_editor_focus for select to authenticated using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = (select auth.uid())));

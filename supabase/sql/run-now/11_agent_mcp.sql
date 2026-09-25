/* MCP page tools: page actions in the agent log and the builder's selected section. Needs part 02. */
alter table public.theme_agent_activity add column if not exists detail jsonb;
alter table public.theme_agent_activity drop constraint if exists theme_agent_activity_action_check;
alter table public.theme_agent_activity add constraint theme_agent_activity_action_check check (action in ('created', 'updated', 'page', 'page_created')) not valid;
create table if not exists public.theme_editor_focus ( install_id uuid primary key references public.store_theme_installs(id) on delete cascade, page_key text not null check (page_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'), section_id text check (section_id is null or char_length(section_id) <= 128), block_id text check (block_id is null or char_length(block_id) <= 128), updated_at timestamptz not null default now() );
alter table public.theme_editor_focus enable row level security;
revoke insert, update, delete on public.theme_editor_focus from anon, authenticated;
drop policy if exists "Creators read their own editor focus" on public.theme_editor_focus;
create policy "Creators read their own editor focus" on public.theme_editor_focus for select to authenticated using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = (select auth.uid())));
notify pgrst, 'reload schema';

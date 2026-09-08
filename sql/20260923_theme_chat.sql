-- ===========================================================================
--  THE THEME EDITOR'S CONVERSATION, KEPT
-- ===========================================================================
-- It lived in React state and died on reload: ask for three changes, refresh,
-- and there was no record of what you had asked for or what it had done. The
-- sections survived — they are the site — but the reasoning behind them did
-- not, which is the question somebody actually has when they come back.
--
-- Modelled on site_chat_messages, deliberately: the same two-row-per-exchange
-- shape, the same "written server-side, never posted by the client" rule. A
-- client that writes its own transcript can write a transcript that never
-- happened.
create table if not exists public.theme_chat_messages (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.store_theme_installs(id) on delete cascade,
  -- Which page the exchange was about. The same theme has several, and
  -- "make the hero shorter" means nothing without knowing which hero.
  page_key text not null default 'home',
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  -- What actually changed, as the operations that were applied. Read back
  -- only with their message and never queried across messages, which is the
  -- shape of a column rather than a second table.
  ops jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists theme_chat_messages_install_idx
  on public.theme_chat_messages (install_id, created_at);

alter table public.theme_chat_messages enable row level security;

-- Readable by the creator who owns the theme, through the same ownership path
-- every other theme table uses. The writes come from the service role in the
-- agent route, which has already proved ownership against the user's own
-- client before it gets there.
do $$
declare
  owned text := '
    install_id in (
      select i.id from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where c.user_id = auth.uid()
    )';
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_chat_messages' and policyname = 'tcm_own'
  ) then
    execute format('create policy tcm_own on public.theme_chat_messages using (%s) with check (%s)', owned, owned);
  end if;
end $$;

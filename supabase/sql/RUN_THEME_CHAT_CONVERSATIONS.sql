-- ===========================================================================
--  Storelib: Ask Storelib conversations (new chat and history)
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: a second run changes
--  nothing. The same statements as
--  supabase/migrations/20260930_theme_chat_conversations.sql and
--  supabase/sql/run-now/24_theme_chat_conversations.sql.
--
--  Each message on a website now belongs to a conversation. Conversations are
--  written by the agent route with the service role after it has proved the
--  caller owns the install, and read through the creator's own client, where
--  the policy below is the ownership chain every theme table uses. A message
--  can only be filed under a conversation on its own install: the composite
--  foreign key enforces it. Messages from before this keep a null
--  conversation and show as one earlier thread in the history.
-- ===========================================================================

create table if not exists public.theme_chat_messages (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.store_theme_installs(id) on delete cascade,
  page_key text not null default 'home',
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  ops jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists theme_chat_messages_install_idx on public.theme_chat_messages (install_id, created_at);
alter table public.theme_chat_messages enable row level security;

create table if not exists public.theme_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.store_theme_installs(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists theme_chat_conversations_install_idx on public.theme_chat_conversations (install_id, updated_at desc);
create unique index if not exists theme_chat_conversations_id_install on public.theme_chat_conversations (id, install_id);
alter table public.theme_chat_conversations enable row level security;

alter table public.theme_chat_messages add column if not exists conversation_id uuid;
alter table public.theme_chat_messages drop constraint if exists theme_chat_messages_conversation_fk;
alter table public.theme_chat_messages add constraint theme_chat_messages_conversation_fk foreign key (conversation_id, install_id) references public.theme_chat_conversations (id, install_id) on delete cascade;
create index if not exists theme_chat_messages_conversation_idx on public.theme_chat_messages (conversation_id, created_at);

drop policy if exists tcc_own_read on public.theme_chat_conversations;
create policy tcc_own_read on public.theme_chat_conversations for select using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid()));

do $$ begin if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theme_chat_messages' and policyname = 'tcm_own') then create policy tcm_own on public.theme_chat_messages using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid())) with check (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid())); end if; end $$;

select to_regclass('public.theme_chat_conversations') is not null
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'theme_chat_messages' and column_name = 'conversation_id')
   and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theme_chat_conversations' and policyname = 'tcc_own_read')
   as theme_chat_conversations_ok;

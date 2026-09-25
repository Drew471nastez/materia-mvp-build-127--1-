-- ===========================================================================
--  ASK STORELIB KEEPS CONVERSATIONS APART
-- ===========================================================================
-- Every message on a website used to be one long thread. Now a creator can
-- start a new chat and go back to an old one, so each message belongs to a
-- conversation, and the history lists them.
--
-- Written by the agent route with the service role, after it has proved the
-- caller owns the install against their own client. Read through the user's
-- client, where the policy below is the same ownership chain every other
-- theme table uses: a creator lists and opens their own conversations on
-- their own websites and nobody else's.
--
-- A message's conversation must be on the SAME install as the message. The
-- composite foreign key says so in the database, so no code path can file a
-- message from one website under another website's conversation.
--
-- Messages from before this ran keep a null conversation_id. The history
-- shows them as one earlier thread, and continuing it moves them into a new
-- conversation (lib/website-builder/agent/chat.ts, openThemeConversation).
--
-- Idempotent. Needs theme_chat_messages (sql/20260923_theme_chat.sql), and
-- creates it in the same shape when it is not there yet.

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
  -- The first thing asked in it, cut to a line.
  title text not null default '',
  created_at timestamptz not null default now(),
  -- Moved on every message, so the history is newest first.
  updated_at timestamptz not null default now()
);
create index if not exists theme_chat_conversations_install_idx on public.theme_chat_conversations (install_id, updated_at desc);
-- What the composite key below points at.
create unique index if not exists theme_chat_conversations_id_install on public.theme_chat_conversations (id, install_id);
alter table public.theme_chat_conversations enable row level security;

alter table public.theme_chat_messages add column if not exists conversation_id uuid;
alter table public.theme_chat_messages drop constraint if exists theme_chat_messages_conversation_fk;
alter table public.theme_chat_messages add constraint theme_chat_messages_conversation_fk foreign key (conversation_id, install_id) references public.theme_chat_conversations (id, install_id) on delete cascade;
create index if not exists theme_chat_messages_conversation_idx on public.theme_chat_messages (conversation_id, created_at);

-- Read only for the creator. There is no client path that writes a
-- conversation: the agent route does, with the service role.
drop policy if exists tcc_own_read on public.theme_chat_conversations;
create policy tcc_own_read on public.theme_chat_conversations for select using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid()));

-- The messages' own policy, for a database that is getting the table here.
do $$ begin if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theme_chat_messages' and policyname = 'tcm_own') then create policy tcm_own on public.theme_chat_messages using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid())) with check (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = auth.uid())); end if; end $$;

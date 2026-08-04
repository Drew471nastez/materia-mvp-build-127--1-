-- ===========================================================================
-- STORELIB — LIVE MESSAGES, AND LEAVING A CONVERSATION
-- ===========================================================================
-- Run this AFTER supabase/sql/RUN_MESSAGING_ALL.sql. Safe to run more than
-- once: every statement checks before it acts.
--
-- Two things:
--   1. Postgres starts announcing new messages, so a conversation is live
--      instead of asking every fifteen seconds.
--   2. The two columns that make "Șterge conversația" actually do something.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Live messages
-- ---------------------------------------------------------------------------
-- Realtime only forwards rows from tables that are IN the publication, and by
-- default `messages` is not. Without this the client subscribes, the channel
-- reports itself connected, and no event ever arrives — a thread that looks
-- live and silently is not, which is worse than one that is honestly slow.
--
-- `add table` raises if the table is already published, so it is guarded rather
-- than wrapped in a begin/exception block: an error swallowed here would hide a
-- genuinely missing publication.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found — is Realtime enabled on this project?';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  -- Conversations too: `last_message_at` moving is what re-sorts the inbox, and
  -- it is the cheapest possible signal that something happened in a thread you
  -- do not currently have open.
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- What a subscriber is allowed to hear.
--
-- This is the part that is easy to get dangerously wrong. Realtime evaluates
-- RLS against the subscriber's own JWT, so `messages_select` — which already
-- says "only if you are a party to the parent conversation" — is what stops one
-- person's socket receiving another person's messages. It is enabled by
-- 20260802 and is asserted here rather than assumed, because a table published
-- to Realtime WITHOUT row-level security broadcasts every row to every
-- subscriber.
do $$ begin
  if to_regclass('public.messages') is not null then
    execute 'alter table public.messages enable row level security';
  end if;
  if to_regclass('public.conversations') is not null then
    execute 'alter table public.conversations enable row level security';
  end if;
end $$;

-- The filter the client subscribes with is `conversation_id=eq.<id>`, and
-- Realtime applies it server-side per row. This index is what keeps that cheap
-- and is almost certainly already here from 20260802.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);


-- ---------------------------------------------------------------------------
-- 2. Leaving a conversation
-- ---------------------------------------------------------------------------
-- Per person, not per thread. A conversation is shared, so one party pressing
-- delete must not reach into the other party's inbox and remove something they
-- are still in the middle of — it hides the thread from whoever asked, and
-- comes back for them if the other person writes again (the inbox compares
-- `last_message_at` against the delete stamp).
alter table public.conversations add column if not exists buyer_deleted_at timestamptz;
alter table public.conversations add column if not exists seller_deleted_at timestamptz;

-- No new policy: `conversations_touch` from 20260802 already restricts updates
-- to the two parties, and which of the two columns a caller may set is decided
-- by the API, which knows which side they are on.


-- ---------------------------------------------------------------------------
-- What actually ran
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages', 'conversations'))            as realtime_tables,  -- expect 2
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations'
      and column_name in ('buyer_deleted_at', 'seller_deleted_at')) as delete_columns; -- expect 2

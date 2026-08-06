-- ===========================================================================
--  Storelib — push notifications for chat messages
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: running it again changes
--  nothing and raises nothing.
--
--  Until this has run, chat pushes DEGRADE rather than break:
--    · the idempotency table is missing, so the code falls back to sending
--      (a duplicate is a worse failure than a missing one, but only just —
--       see lib/push/message-notification.ts, which logs it loudly)
--    · the two preference columns are missing, so everyone is treated as
--      opted in with previews on, which is the default anyway
--  Nothing here is required for a message to SEND.
-- ===========================================================================

-- ── 1. Idempotency ─────────────────────────────────────────────────────────
--  One row per message that has been through push processing. The primary key
--  is the whole mechanism: `insert … on conflict do nothing` returning zero
--  rows means somebody else got there first, and Postgres decides that under
--  concurrency rather than us.
--
--  This is why there is no in-memory dedupe anywhere in this feature. Vercel
--  functions do not share memory, so a module-level Set is a dedupe that works
--  perfectly on one instance and not at all across two — which is the shape of
--  bug that only appears under load, i.e. exactly when it matters.
create table if not exists public.message_push_log (
  message_id    uuid        primary key,
  recipient_id  uuid        not null,
  created_at    timestamptz not null default now()
);

comment on table public.message_push_log is
  'One row per message already considered for a push. The primary key IS the idempotency key — see lib/push/message-notification.ts.';

--  Housekeeping. This table only answers "have we already handled this
--  message", and that question has no meaning after a few minutes: a retry
--  that arrives a day later is not a retry. Kept for a week so the window is
--  generous, and indexed so the delete can find its rows.
create index if not exists message_push_log_created_at_idx
  on public.message_push_log (created_at);

--  Nobody reads this table through the API — only the service role writes it,
--  from the server. RLS on with no policy means exactly that: the service role
--  bypasses it, everyone else sees nothing.
alter table public.message_push_log enable row level security;

-- ── 2. Notification preferences ────────────────────────────────────────────
--  On `profiles` rather than in a table of their own, deliberately. There are
--  two booleans; a preferences table would be a join on every push and a
--  migration for every new switch, and this project already reads `profiles`
--  on the push path to get the sender's name.
--
--  Both default TRUE. A column added to a table with existing rows fills them
--  with the default, so nobody is silently opted out by this migration.
alter table public.profiles add column if not exists push_messages_enabled boolean not null default true;
alter table public.profiles add column if not exists push_preview_enabled  boolean not null default true;

comment on column public.profiles.push_messages_enabled is
  'False silences chat push entirely for this account. Sale and payout notifications are unaffected.';
comment on column public.profiles.push_preview_enabled is
  'False sends the notification without the message text: "Storelib — Ai un mesaj nou".';

-- ── 3. What the aggregation is counted from ────────────────────────────────
--  Nothing to create. "N mesaje noi" is
--
--    select count(*) from messages
--     where conversation_id = $1 and sender_id <> $2 and read_at is null
--
--  which is the same source of truth the unread badge and the inbox already
--  use. There is no counter to drift, and the number is recalculable at any
--  moment from the messages themselves.
--
--  The index that makes it cheap should already exist from the messaging
--  migration; created here if not.
create index if not exists messages_conversation_unread_idx
  on public.messages (conversation_id, read_at)
  where read_at is null;

-- ── Tell PostgREST the table changed ──────────────────────────────────────
--  Not optional. PostgREST validates against its own cached schema before
--  Postgres is asked anything, so a column added above does not exist as far
--  as the API is concerned until this runs.
notify pgrst, 'reload schema';

select 'message push: log table, preference columns and unread index are ready' as result;

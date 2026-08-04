-- ===========================================================================
-- STORELIB — MESSAGING, ALL OF IT, IN ORDER  (run this one file)
-- ===========================================================================
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Why this file exists: `20260806_message_images_and_safety.sql` failed with
--   ERROR: 42P01: relation "public.messages" does not exist
-- which is not a fault in that migration — it is that the migration which
-- CREATES public.messages had never been run. 20260806 only adds a column to a
-- table it assumed was already there.
--
-- So the four messaging migrations are concatenated here in dependency order:
-- the tables, then notifications, then the official Storelib account, then
-- photos and the safety actions. Every statement in every one of them guards
-- itself (create if not exists / drop policy if exists / add column if not
-- exists), so running this is safe whether you have none of it, some of it, or
-- all of it already.
--
-- One prerequisite outside this file: public.products and public.profiles must
-- exist, which they do — the listings themselves depend on them.
-- ===========================================================================



-- ===========================================================================
-- Messaging: conversations, messages, offers
-- (supabase/migrations/20260802_messages_offers.sql)
-- ===========================================================================

-- Buyer–seller messaging, with offers as a first-class message kind.
--
-- One conversation per (listing, buyer). The seller is denormalised onto the
-- conversation so RLS can check membership without joining through products,
-- and so the inbox query is one indexed read per side.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid,  -- FK to public.products added conditionally at the end
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_distinct_parties check (buyer_id <> seller_id),
  unique (listing_id, buyer_id)
);

create index if not exists conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'offer')),
  body text,
  offer_cents integer check (offer_cents is null or offer_cents > 0),
  offer_status text check (offer_status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- A text message has a body; an offer has an amount and a status.
  constraint messages_shape check (
    (kind = 'text' and body is not null and offer_cents is null)
    or
    (kind = 'offer' and offer_cents is not null and offer_status is not null)
  )
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Participants can see their conversations; only a buyer can open one, and only
-- about someone else's listing (the parties check above enforces the latter).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (auth.uid() = buyer_id);

drop policy if exists conversations_touch on public.conversations;
create policy conversations_touch on public.conversations
  for update using (auth.uid() = buyer_id or auth.uid() = seller_id)
  with check (auth.uid() = buyer_id or auth.uid() = seller_id);

-- Messages: participants read; the sender writes as themself, into a
-- conversation they are part of.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Updates cover two distinct moves, and RLS only gates WHO; the API gates WHAT:
-- the counterparty answers an offer, and a reader marks the other side's
-- messages read. Both are "a participant touching a message they did not send".
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );


-- ===========================================================================
-- Notifications: the inbox's second tab
-- (supabase/migrations/20260803_notifications.sql)
-- ===========================================================================

-- Notifications: the inbox's second tab.
--
-- One row per event, addressed to one recipient. The row stores only ids —
-- who acted, which listing, which conversation — and the API enriches at read
-- time, so a renamed profile or retitled listing never leaves stale copy here.
-- Cascades mean a deleted account or listing takes its notifications with it.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'offer_received', 'offer_accepted', 'offer_declined', 'message')),
  actor_id uuid references auth.users(id) on delete cascade,
  listing_id uuid,  -- FK to public.products added conditionally at the end
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- The feed is always "my latest", and the badge is always "my unread" — one
-- index per question, the second partial because read rows never matter to it.
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- You read your own rows and mark your own rows read. There is deliberately NO
-- insert policy: notifications are created server-side through the admin
-- client from trusted code paths, so a client can never forge one — not even
-- for itself.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ===========================================================================
-- The official Storelib account
-- (supabase/migrations/20260804_system_account.sql)
-- ===========================================================================

-- storelib — the official Storelib account, sitting in every inbox.
--
-- Storelib itself should be a correspondent: it sends product news and selling
-- tips, and people can write back to it for support. That thread is about
-- nothing in particular — there is no listing behind it — which is the one
-- shape 20260802_messages_offers.sql did not allow, so this migration widens
-- the schema by exactly that much. Safe to run more than once.

-- A system thread has no item. listing_id stays a foreign key to products; it
-- just stops being mandatory, so a conversation can exist without one.
-- Already nullable above; kept for databases created by the older migration.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='conversations'
                and column_name='listing_id' and is_nullable='NO') then
    alter table public.conversations alter column listing_id drop not null;
  end if;
end $$;

-- Which of the two shapes a row is. Everything written before today is a
-- listing thread, and the default keeps the buyer→seller insert in
-- app/api/messages/route.ts correct without that route knowing this column
-- exists. `if not exists` skips the CHECK too on a re-run, which is what makes
-- the whole statement idempotent.
alter table public.conversations
  add column if not exists kind text not null default 'listing'
    check (kind in ('listing', 'system'));

-- The table's `unique (listing_id, buyer_id)` cannot police system rows: NULLs
-- are never equal to one another in a unique index, so every system thread
-- would read as distinct and a user could accumulate dozens. This partial
-- index is the real rule — one Storelib thread per person — and the
-- find-or-create in lib/system-account.ts leans on it to survive two requests
-- racing on a first page load.
create unique index if not exists conversations_system_unique
  on public.conversations (buyer_id)
  where kind = 'system';

-- The blue check. A boolean rather than a roles table, because "official" is
-- one bit about a handful of accounts and the inbox reads it in the same trip
-- that already fetches the display name.
do $$ begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists is_official boolean not null default false;
  end if;
end $$;

-- Row-level security needs no change here, and that is worth stating rather
-- than assuming:
--
--   conversations_select is (auth.uid() = buyer_id or auth.uid() = seller_id).
--   A person is the buyer_id on their own system thread, so they read it.
--
--   messages_select and messages_insert both test membership of the parent
--   conversation, so replying to Storelib is an ordinary message, and
--   messages_update lets the reader mark Storelib's messages read exactly the
--   way they mark a seller's.
--
--   conversations_insert (auth.uid() = buyer_id) is deliberately left alone.
--   System threads are created server-side with the service role, which
--   bypasses RLS entirely, so loosening this policy would buy nothing and
--   would only widen what a client is able to forge.
--
-- One inherited constraint does bite, and lib/system-account.ts respects it:
-- conversations_distinct_parties (buyer_id <> seller_id) means the Storelib
-- account cannot hold a system thread with itself. It is skipped rather than
-- special-cased.

-- ---------------------------------------------------------------------------
-- Operator step, deliberately not automated.
--
-- Pick the auth user that IS Storelib and mark its profile. Nothing above
-- invents that account: a uuid guessed in a migration would silently promote
-- somebody else's profile to official, and there is no undoing that quietly.
--
--   update public.profiles
--      set is_official  = true,
--          display_name = 'Storelib',
--          username     = 'storelib'
--    where id = '<uuid of the Storelib auth user>';
--
-- Then either set STORELIB_SYSTEM_USER_ID to that same uuid, or leave it unset
-- and let lib/system-account.ts find the flagged row on its own. Note that it
-- keys off is_official and not off the username: nothing reserves "storelib"
-- as a handle today, so the flag — which only this statement can set — is what
-- actually confers the identity.
--
-- Until one of those is true the feature is inert on purpose: no system thread
-- is created, no blue check renders, and the inbox behaves exactly as it did
-- before this file ran.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- Photos in a thread, blocking, reports, per-person delete
-- (supabase/migrations/20260806_message_images_and_safety.sql)
-- ===========================================================================

-- Photos in a conversation, and the three things you need to be able to do
-- about the person on the other end of one.
--
-- Run this whole file in the Supabase SQL editor. It is idempotent: every
-- statement guards itself, so re-running it is safe.

-- ---------------------------------------------------------------------------
-- 1. A message can be a photo
-- ---------------------------------------------------------------------------
-- Half of what gets said between a buyer and a seller is "can I see the label",
-- "what does the sole look like", "here it is on". Without this the answer is a
-- link pasted into a text message, which is not an answer.
alter table public.messages add column if not exists image_url text;

-- The kind and shape constraints are replaced rather than added to, because a
-- check constraint cannot be extended in place. Dropping first means this is
-- safe to run over the old schema or the new one.
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages drop constraint if exists messages_shape;

alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'offer', 'image'));

alter table public.messages
  add constraint messages_shape check (
    (kind = 'text'  and body is not null and offer_cents is null)
    or
    (kind = 'offer' and offer_cents is not null and offer_status is not null)
    or
    -- A caption is optional. A photo is not.
    (kind = 'image' and image_url is not null and offer_cents is null)
  );

-- ---------------------------------------------------------------------------
-- 2. The bucket those photos live in
-- ---------------------------------------------------------------------------
-- Private, unlike `listings`: a photo sent in a conversation is between two
-- people, and a public bucket would make it readable by anyone who ever saw the
-- URL. Reads go through signed URLs minted by the server for the two parties.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messages',
  'messages',
  false,
  10485760, -- 10 MB; a phone photo compressed client-side is well under this
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Every object is filed under the sender's own id, so "is this yours" is a
-- prefix comparison rather than a join.
drop policy if exists "messages_upload_own" on storage.objects;
create policy "messages_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "messages_read_own" on storage.objects;
create policy "messages_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "messages_delete_own" on storage.objects;
create policy "messages_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. Blocking
-- ---------------------------------------------------------------------------
-- One row per direction. Blocking is not symmetric and must not be stored as
-- though it were: the person who blocked knows, the person blocked does not.
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- You can see, make and undo your own blocks, and nobody else's. Notably there
-- is no policy letting the blocked party read this table: a block they can look
-- up is a block that tells them they were blocked.
drop policy if exists "user_blocks_own_select" on public.user_blocks;
create policy "user_blocks_own_select" on public.user_blocks
  for select to authenticated using (auth.uid() = blocker_id);

drop policy if exists "user_blocks_own_insert" on public.user_blocks;
create policy "user_blocks_own_insert" on public.user_blocks
  for insert to authenticated with check (auth.uid() = blocker_id);

drop policy if exists "user_blocks_own_delete" on public.user_blocks;
create policy "user_blocks_own_delete" on public.user_blocks
  for delete to authenticated using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- 4. Reports
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid references auth.users(id) on delete set null,
  reason text not null,
  detail text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists conversation_reports_status_idx
  on public.conversation_reports (status, created_at desc);

alter table public.conversation_reports enable row level security;

-- A reporter may file one and may see their own. Nobody reads anyone else's
-- through this API — moderation runs on the service role.
drop policy if exists "conversation_reports_insert_own" on public.conversation_reports;
create policy "conversation_reports_insert_own" on public.conversation_reports
  for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists "conversation_reports_select_own" on public.conversation_reports;
create policy "conversation_reports_select_own" on public.conversation_reports
  for select to authenticated using (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- 5. Leaving a conversation
-- ---------------------------------------------------------------------------
-- Deleting is per-person. A thread is shared, so one party pressing delete must
-- not reach into the other party's inbox and remove a conversation they are
-- still having — it hides it from the one who asked, and comes back for them
-- if the other person writes again.
alter table public.conversations add column if not exists buyer_deleted_at timestamptz;
alter table public.conversations add column if not exists seller_deleted_at timestamptz;

-- The existing update policy already restricts writes to the two parties, so no
-- new policy is needed — a party may set their own side's column, and the API
-- is what decides which one that is.


-- ===========================================================================
-- 5. Foreign keys to the listings tables, added only if those tables exist
-- ===========================================================================
-- `listing_id` above is a plain uuid rather than an inline `references
-- public.products(id)`, and that is not a shortcut — it is the difference
-- between this file running and this file stopping on line 40.
--
-- An inline FK is evaluated the moment the CREATE TABLE is parsed, so on a
-- database without public.products the very first statement raises 42P01 and
-- nothing after it runs. Declaring the column first and attaching the
-- constraint here means the messaging schema installs on any database, and
-- picks up its referential integrity the moment the listings tables are there —
-- run this file again after them and the constraints appear.
--
-- Idempotent both ways: it does nothing if the table is missing, and nothing if
-- the constraint already exists.

do $$ begin
  if to_regclass('public.products') is null then
    raise notice 'public.products not found — conversations.listing_id left without a foreign key. Re-run this file once the listings schema exists.';
    return;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'conversations_listing_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_listing_id_fkey
      foreign key (listing_id) references public.products(id) on delete cascade;
  end if;

  if to_regclass('public.notifications') is not null
     and not exists (select 1 from pg_constraint where conname = 'notifications_listing_id_fkey') then
    alter table public.notifications
      add constraint notifications_listing_id_fkey
      foreign key (listing_id) references public.products(id) on delete cascade;
  end if;
end $$;


-- ===========================================================================
-- 6. Realtime, unsending a message, and leaving a conversation
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Live messages
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
-- Unsending one message
-- ---------------------------------------------------------------------------
-- Soft, not hard. A row that simply disappears leaves the other person looking
-- at a gap where something used to be, with no way to tell whether they
-- misremembered it — so it becomes "Mesaj șters", which is both honest and what
-- every chat app does. It also keeps the day dividers and message grouping
-- intact, which a vanished row would otherwise reshuffle.
alter table public.messages add column if not exists deleted_at timestamptz;

-- The shape constraint has to allow an emptied row. A deleted message keeps its
-- `kind` — the conversation still knows a photo was there — but loses its body
-- and its image, and both of those are `not null` for their kind under the
-- constraint written above. Without this, the delete fails with a check
-- violation and the message stays on screen.
alter table public.messages drop constraint if exists messages_shape;
alter table public.messages
  add constraint messages_shape check (
    deleted_at is not null
    or (kind = 'text'  and body is not null and offer_cents is null)
    or (kind = 'offer' and offer_cents is not null and offer_status is not null)
    or (kind = 'image' and image_url is not null and offer_cents is null)
  );

-- No new RLS policy, deliberately. `messages_update` requires
-- `sender_id <> auth.uid()` — it exists so the OTHER party can mark things read
-- and answer offers — so an author editing their own row is exactly the case it
-- forbids. Rather than widen it and hand every client a way to rewrite its own
-- history, the delete endpoint proves ownership through the caller's client and
-- then writes this one field with the service role.


-- ===========================================================================
-- What actually ran — every number here should be as commented
-- ===========================================================================
select
  to_regclass('public.products')             as products,               -- not null
  to_regclass('public.conversations')        as conversations,          -- not null
  to_regclass('public.messages')             as messages,               -- not null
  to_regclass('public.notifications')        as notifications,          -- not null
  to_regclass('public.user_blocks')          as user_blocks,            -- not null
  to_regclass('public.conversation_reports') as conversation_reports,   -- not null
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('messages', 'conversations'))                   as realtime_tables,   -- 2
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations'
      and column_name in ('buyer_deleted_at', 'seller_deleted_at'))     as delete_columns,    -- 2
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'messages'
      and column_name in ('image_url', 'deleted_at'))                   as message_columns,   -- 2
  (select count(*) from storage.buckets where id = 'messages')          as messages_bucket;   -- 1

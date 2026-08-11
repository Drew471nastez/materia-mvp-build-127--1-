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
-- Every messaging migration is concatenated here in dependency order: the
-- tables, notifications, the official Storelib account, photos and the safety
-- actions, then realtime and unsending. Every statement guards itself (create
-- if not exists / drop policy if exists / add column if not exists), so running
-- this is safe whether you have none of it, some of it, or all of it already.
--
-- NO PREREQUISITES. An earlier version of this file said public.products and
-- public.profiles had to exist first — they did not, and saying so was worse
-- than useless because it made the 42P01 look like your database's fault. Every
-- reference to them is now conditional: the messaging schema installs on an
-- empty database, and picks up its foreign keys and the is_official flag the
-- moment those tables appear. Run this file again after them and the
-- constraints attach themselves.
--
-- The one thing to check BEFORE running it is that you are in the right
-- project. `products` coming back null in the select at the bottom, on a site
-- that is serving listings right now, means this ran somewhere the app never
-- reads.
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

-- And you may throw your own away.
--
-- This was missing, and its absence is a specific bug rather than a gap. RLS is
-- deny-by-default per COMMAND: with select and update policies present and no
-- delete policy, a DELETE is not rejected — it matches zero rows and reports
-- success. So the app's "dismiss notification" removed the row from the screen,
-- got `{ ok: true }` back, and watched it return on the next load, with nothing
-- anywhere saying why.
--
-- The app no longer deletes notifications at all (it marks them read, which is
-- what Depop and Vinted do and what the update policy above already allowed),
-- so this exists to make DELETE /api/notifications mean what it says if anything
-- ever calls it — an account teardown, a moderation tool — rather than to
-- restore a button.
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (auth.uid() = user_id);

-- "My unread, in this conversation" — the lookup that collapses a burst of
-- messages into one notification instead of one per line (lib/notifications.ts).
-- Partial, because a read row is never the answer to it.
create index if not exists notifications_convo_unread_idx
  on public.notifications (user_id, conversation_id)
  where read_at is null;


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

-- Unsending, brought forward from the end of this file.
--
-- IT HAS TO BE HERE, and the reason is a real failure rather than tidiness. The
-- shape constraint below is dropped and re-added; re-adding it VALIDATES every
-- existing row. A soft-deleted message has kind = 'text' and body = NULL, which
-- the shape written below does not allow — so on any database where somebody
-- has ever unsent a message, a SECOND run of this file died on
--
--   ERROR: 23514: check constraint "messages_shape" of relation "messages"
--          is violated by some row
--
-- and took every section after it down with it. The column has to exist before
-- the constraint can mention it, so it is created here and the constraint below
-- allows for it from the start. (Repeated at the end of the file, where it
-- belongs narratively; `if not exists` makes the second one a no-op.)
alter table public.messages add column if not exists deleted_at timestamptz;

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
    -- A deleted message keeps its `kind` — the conversation still knows a photo
    -- was there — but loses its body and its image.
    deleted_at is not null
    or (kind = 'text'  and body is not null and offer_cents is null)
    or (kind = 'offer' and offer_cents is not null and offer_status is not null)
    -- A caption is optional. A photo is not.
    or (kind = 'image' and image_url is not null and offer_cents is null)
  ) not valid;

-- `not valid` means: enforce this on every write from now on, but do not scan
-- the rows that are already here.
--
-- That is the correct trade for a file whose entire promise is that it can be
-- re-run. History cannot be fixed by refusing to add a constraint to it — the
-- malformed row is already stored, and aborting the migration leaves the ten
-- sections after this one unapplied to punish it. Every future insert and
-- update is checked exactly as it would be otherwise.
--
-- Sweep the old rows too, once you know they are clean:
--   alter table public.messages validate constraint messages_shape;
-- The query in the block below is what tells you whether they are.

do $$
declare
  bad int;
begin
  select count(*) into bad
    from public.messages
   where deleted_at is null
     and not (
       (kind = 'text'  and body is not null and offer_cents is null)
       or (kind = 'offer' and offer_cents is not null and offer_status is not null)
       or (kind = 'image' and image_url is not null and offer_cents is null)
     );

  if bad > 0 then
    raise notice '% message row(s) do not match the shape constraint. They are left alone and every new write is still checked; see messages_shape.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The bucket those attachments live in
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
  -- NULL = no bucket-level type gate, and that is deliberate.
  --
  -- This used to be an image-only array, written when photographs were the only
  -- thing anyone could attach. Voice notes then failed with `mime type
  -- audio/webm is not supported` — refused by the BUCKET, before a line of app
  -- code ran, and unfixable by deploying anything. Adding the audio types would
  -- only move the same trap one attachment kind along, and the `do update`
  -- below means re-running this file re-imposes whatever is written here.
  --
  -- What the array actually checked was the content type the CLIENT declared,
  -- which is a label rather than a fact. Both message routes sniff the
  -- container's magic bytes and refuse anything that is not really the kind of
  -- file it claims to be — so the honest gate is in app code, and the bucket's
  -- one only ever caught honest files. Same reasoning, and the same NULL, as
  -- the buckets in complete_upload_system.sql.
  null
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
-- Foreign keys to the listings tables, added only if those tables exist
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
-- Realtime, and unsending a message
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
--
-- Already spelled exactly this way further up, where the column is created. It
-- is repeated rather than removed because this is where the rule belongs in the
-- story of the file, and re-adding an identical constraint costs one statement.
-- `not valid` for the same reason it is up there: a re-run must not abort on a
-- row that predates the rule.
alter table public.messages drop constraint if exists messages_shape;
alter table public.messages
  add constraint messages_shape check (
    deleted_at is not null
    or (kind = 'text'  and body is not null and offer_cents is null)
    or (kind = 'offer' and offer_cents is not null and offer_status is not null)
    or (kind = 'image' and image_url is not null and offer_cents is null)
  ) not valid;

-- No new RLS policy, deliberately. `messages_update` requires
-- `sender_id <> auth.uid()` — it exists so the OTHER party can mark things read
-- and answer offers — so an author editing their own row is exactly the case it
-- forbids. Rather than widen it and hand every client a way to rewrite its own
-- history, the delete endpoint proves ownership through the caller's client and
-- then writes this one field with the service role.



-- ===========================================================================
-- Following, and who is online
-- ===========================================================================
-- Not messaging, but in this file for the same reason everything else is: the
-- Follow button on a member page cannot work if `public.follows` does not
-- exist, and the symptom — a button that does nothing — looks like a bug in the
-- button rather than a table that was never created.

-- (supabase/migrations/20260731_follows.sql)

-- ============================================================================
-- storelib — the follow graph
--
-- Backs the Following tab in the mobile feed and the Follow control on each
-- listing. Safe to run more than once.
--
-- A follow points at a PROFILE (which is an auth user), not at a creator row.
-- Sellers are reached through creators, but a person is the thing you follow —
-- that way the People results in search can use exactly the same button, and a
-- seller who later gains or changes a creator row keeps their followers.
-- ============================================================================

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Following yourself is never meaningful and would pollute follower counts.
  constraint follows_no_self check (follower_id <> following_id),
  -- Makes a follow idempotent: the API can upsert without racing itself when a
  -- button is double-tapped.
  constraint follows_unique unique (follower_id, following_id)
);

-- "Who do I follow" (the Following feed, and hydrating button state).
create index if not exists idx_follows_follower_id on public.follows (follower_id);
-- "How many follow them" (follower counts on a profile).
create index if not exists idx_follows_following_id on public.follows (following_id);

alter table public.follows enable row level security;

-- The graph is public, the same way follower counts are public on any
-- marketplace: anyone may read it, but you may only ever add or remove your own
-- follows. follower_id is never taken from the request body.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows for select
  using (true);

drop policy if exists "users insert their own follows" on public.follows;
create policy "users insert their own follows"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "users delete their own follows" on public.follows;
create policy "users delete their own follows"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- (supabase/migrations/20260731_presence.sql)

-- ============================================================================
-- storelib — last-seen presence
--
-- Backs the online/offline dot on the Following list. Deliberately a single
-- timestamp rather than a realtime presence channel: the dot only needs to say
-- "around recently", and a column costs nothing to read alongside the profile
-- rows we already fetch. Safe to run more than once.
-- ============================================================================

-- Guarded, like every other reference to public.profiles in this file. The
-- header promises no prerequisites and this was the one statement that would
-- still have stopped the script on a database without a profiles table.
do $$ begin
  if to_regclass('public.profiles') is null then
    raise notice 'public.profiles not found — presence skipped. Re-run this file once profiles exists.';
    return;
  end if;

  alter table public.profiles add column if not exists last_seen_at timestamptz;

  -- Read as part of "who do I follow", so it's worth an index once follow lists
  -- get long enough to sort or filter on.
  create index if not exists idx_profiles_last_seen_at
    on public.profiles (last_seen_at desc nulls last);
end $$;


-- ===========================================================================
-- Abuse limits, enforced where they cannot be gone around
-- ===========================================================================
-- The API already rate-limits sending, and that is the layer that produces a
-- decent error message, so it stays. This is the layer underneath it.
--
-- The reason both are needed: Supabase publishes PostgREST, so anyone holding a
-- valid session token can insert into public.messages directly with curl. Every
-- rule that lives only in app/api/messages/**/route.ts is a rule that applies
-- to the app and to nobody else — which is exactly the position a spammer wants
-- to be in. RLS says WHO may write; these triggers say HOW MUCH and TO WHOM,
-- and they run inside the transaction on every path into the table.
--
-- What is deliberately NOT here: anything about the content of a message. Word
-- lists age badly, they are trivially defeated by a space, and they misfire on
-- the languages this app is actually used in. Volume and consent are the two
-- things a database can judge correctly, so they are the two things it judges.
-- ---------------------------------------------------------------------------

-- 1. Volume.
--
-- The window is the last minute, counted from the sender's own rows in this
-- conversation and across all of them. Two limits rather than one because they
-- catch different things: 20/min in one thread is somebody hammering a single
-- seller, 60/min overall is somebody working through a list of them.
--
-- Generous on purpose. A real argument between a buyer and a seller can run at
-- fifteen messages a minute and must not hit a wall; the numbers are set where
-- only automation reaches them.
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  in_thread int;
  overall   int;
begin
  select count(*) into in_thread
    from public.messages
   where sender_id = new.sender_id
     and conversation_id = new.conversation_id
     and created_at > now() - interval '1 minute';

  if in_thread >= 20 then
    raise exception 'rate_limited: too many messages in this conversation'
      using errcode = '53400';
  end if;

  select count(*) into overall
    from public.messages
   where sender_id = new.sender_id
     and created_at > now() - interval '1 minute';

  if overall >= 60 then
    raise exception 'rate_limited: too many messages'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit_trg on public.messages;
create trigger messages_rate_limit_trg
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- The index that makes the two counts above cheap. Without it every insert
-- scans the sender's whole history, and the rate limiter becomes the slowest
-- thing about sending a message.
create index if not exists messages_sender_recent_idx
  on public.messages (sender_id, created_at desc);

-- 2. Consent.
--
-- A block currently stops the app from delivering, and the app is not the only
-- way in. This closes it at the table: if either party has blocked the other,
-- neither can write to the thread.
--
-- Both directions, and that is the point. Blocking someone must stop them
-- reaching you — but it must also stop YOU writing to them, or "block" becomes
-- a one-way mute that still lets the blocker harass. Every large platform
-- treats a block as severing the channel, not muting one end of it.
create or replace function public.messages_respect_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
    into other
    from public.conversations c
   where c.id = new.conversation_id;

  if other is null then
    return new; -- no counterparty to consider; membership is RLS's business
  end if;

  if exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = new.sender_id and b.blocked_id = other)
        or (b.blocker_id = other and b.blocked_id = new.sender_id)
  ) then
    -- Deliberately vague. "You are blocked" tells the sender something the
    -- person who blocked them chose not to tell them.
    raise exception 'blocked: message not delivered' using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_respect_blocks_trg on public.messages;
create trigger messages_respect_blocks_trg
  before insert on public.messages
  for each row execute function public.messages_respect_blocks();

-- 3. Size.
--
-- A body cap so a single insert cannot be a megabyte of text. 4000 characters
-- is far past any real message and far below anything worth storing by
-- accident. Applied as a constraint rather than a trigger because it is a fact
-- about the column, and it is checked on updates too.
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages
  add constraint messages_body_length
  check (body is null or char_length(body) <= 4000) not valid;
-- `not valid` so the statement cannot fail on history that predates the rule;
-- everything written from now on is checked. Validate it later if you want the
-- old rows swept too:
--   alter table public.messages validate constraint messages_body_length;

-- 4. Reports, rate-limited the same way.
--
-- Report is a button anyone can press about anyone, which makes it a way to
-- flood the moderation queue if it is not bounded. One report per person per
-- conversation is the rule; pressing it again updates nothing and errors
-- nothing the user needs to see.
--
-- ---------------------------------------------------------------------------
-- REPORTING ONE MESSAGE, not just the thread
-- ---------------------------------------------------------------------------
-- A report used to be about a conversation. That is the right unit for "this
-- person is a scammer" and the wrong one for "this specific message asked me
-- for my card number" — which is the one moderation can act on without reading
-- a hundred rows to find what was meant. `message_id` is nullable because both
-- remain true reports: the details sheet still reports the thread, and the menu
-- on a bubble reports that bubble.
--
-- `on delete set null` rather than cascade, deliberately. A message that has
-- been deleted is very often the reason somebody is reporting it, and a report
-- that vanishes when the offender presses "unsend" is a moderation queue the
-- offender controls. The report survives; it simply loses its pointer.
alter table public.conversation_reports
  add column if not exists message_id uuid references public.messages(id) on delete set null;

-- The one-per-reporter rule, split so that per-message reports are not blocked
-- by a thread-level one somebody filed months ago — and so that a hundred
-- reports on a hundred messages is still one report per message.
--
-- Dropped and recreated as PARTIAL: the old unconditional index would refuse a
-- second row for the same (conversation, reporter) whatever its message_id was,
-- which would make the per-message report silently a no-op for anybody who has
-- ever reported that thread. Both new indexes are `if not exists`, so a rerun
-- of this file after the first one is still a no-op.
drop index if exists conversation_reports_one_per_reporter;

create unique index if not exists conversation_reports_one_per_thread
  on public.conversation_reports (conversation_id, reporter_id)
  where message_id is null;

create unique index if not exists conversation_reports_one_per_message
  on public.conversation_reports (reporter_id, message_id)
  where message_id is not null;

create index if not exists conversation_reports_message_idx
  on public.conversation_reports (message_id)
  where message_id is not null;


-- ---------------------------------------------------------------------------
-- 5. Badges: verified, and staff
-- ---------------------------------------------------------------------------
-- `is_official` already exists and means one thing: THIS ROW IS THE STORELIB
-- SYSTEM ACCOUNT. It is what puts the check on the automated thread in every
-- inbox, and it must keep meaning only that — a flag that grows a second
-- meaning is a flag nobody can reason about.
--
-- These are about PEOPLE:
--
--   is_verified   the blue check. This account is who it says it is.
--   is_staff      works for Storelib. Drawn as the Storelib mark beside the
--                 name, and it says "Storelib Admin" when you press it.
--
-- Two columns rather than one enum, because they are genuinely independent: a
-- verified seller who does not work here has the first and not the second, and
-- a staff account that has not been through verification has the second and not
-- the first. One column would force a hierarchy that does not exist.
--
-- Both default false, so running this changes nothing about anybody until the
-- statement below is run deliberately.
alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.profiles
  add column if not exists is_staff boolean not null default false;

-- The one account that has both, addressed by the email it signed up with
-- rather than by a uuid pasted into a file. `lower()` on both sides because an
-- address is case-insensitive in its local part by every practical convention
-- and Supabase stores whatever was typed.
--
-- Idempotent: re-running sets the same two booleans to the same two values.
update public.profiles p
   set is_verified = true,
       is_staff    = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('nastees112@gmail.com');



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
  (select count(*) from storage.buckets where id = 'messages')          as messages_bucket,   -- 1
  (select count(*) from pg_trigger
    where tgrelid = 'public.messages'::regclass and not tgisinternal
      and tgname in ('messages_rate_limit_trg', 'messages_respect_blocks_trg'))
                                                                        as abuse_triggers,    -- 2
  to_regclass('public.follows')              as follows,                -- not null
  to_regclass('public.wishlist_items')       as wishlist_items;         -- not null

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

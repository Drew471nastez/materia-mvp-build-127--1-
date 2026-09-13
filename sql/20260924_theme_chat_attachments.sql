-- ===========================================================================
--  PICTURES ATTACHED TO ASK STORELIB, KEPT FOR THIRTY DAYS
-- ===========================================================================
-- A creator attaches a screenshot and says "build this". Until now the bytes
-- travelled with the request and were gone afterwards, which was the right
-- call while nothing could show them again: the thread kept the words and a
-- note that there had been an image, and a reload lost the picture.
--
-- That is the wrong trade once the conversation itself is saved. Somebody
-- reading back through what they asked for last week should see the picture
-- they asked it about, not a sentence saying there was one.
--
-- THIRTY DAYS, NOT FOR EVER. A screenshot is working material, not a
-- creator's library — that is what site-assets is for, and those must outlive
-- everything. These exist to make a conversation readable while it is still
-- a live conversation. Keeping them for ever would mean a bucket that only
-- grows, holding pictures of other people's websites that nobody will ever
-- open again.
--
-- PRIVATE, WHICH IS THE WHOLE DIFFERENCE FROM site-assets. Those are the
-- images ON a public website and the point is that a visitor sees them. This
-- is a creator's own screenshot of somebody else's page, their unreleased
-- design, their work in progress. It is served only through a signed URL
-- minted after the caller has proved they own the theme.

-- 3MB: the composer shrinks a picture to a long edge of 1568px before it ever
-- gets here, which lands a screenshot at a few hundred kilobytes. This is the
-- backstop, not the target.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'theme-chat-attachments',
  'theme-chat-attachments',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- NO POLICY ON storage.objects FOR THIS BUCKET, deliberately.
--
-- Reads and writes both go through the service role in a route that has
-- already proved ownership against the user's own client. A creator who could
-- read this bucket directly could read every prefix in it by editing a path,
-- and the prefix is another creator's install id. There is no client-side
-- access to grant, so none is granted.

do $$
begin
  if to_regclass('public.store_theme_installs') is null then
    raise notice 'skipping: public.store_theme_installs does not exist here';
    return;
  end if;

  create table if not exists public.theme_chat_attachments (
    id uuid primary key default gen_random_uuid(),
    install_id uuid not null references public.store_theme_installs(id) on delete cascade,
    -- The message it was attached to. Null while the exchange is still being
    -- recorded, and a picture whose message never landed is still expired and
    -- collected on schedule rather than orphaned for ever.
    message_id uuid references public.theme_chat_messages(id) on delete cascade,
    -- Where the bytes are in the bucket: '<install_id>/<uuid>.<ext>'. The
    -- install id leads so a deleted theme's pictures are one prefix.
    storage_path text not null,
    media_type text not null,
    byte_size integer not null default 0,
    -- The creator's own file name, shown back to them and nothing else.
    name text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days')
  );

  create index if not exists theme_chat_attachments_message_idx
    on public.theme_chat_attachments (message_id);
  -- The collector's index: it asks one question, "what is past its date".
  create index if not exists theme_chat_attachments_expiry_idx
    on public.theme_chat_attachments (expires_at);

  alter table public.theme_chat_attachments enable row level security;
exception when others then
  raise notice 'theme_chat_attachments did not apply: %', sqlerrm;
end $$;

-- The same ownership path every other theme table uses.
do $$
declare
  owned text := '
    install_id in (
      select i.id from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where c.user_id = auth.uid()
    )';
begin
  if to_regclass('public.theme_chat_attachments') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_chat_attachments' and policyname = 'tca_own'
  ) then
    execute format('create policy tca_own on public.theme_chat_attachments using (%s) with check (%s)', owned, owned);
  end if;
exception when others then
  raise notice 'the attachment policy did not apply: %', sqlerrm;
end $$;

select 'theme_chat_attachments' as thing,
       to_regclass('public.store_theme_installs') is null
       or to_regclass('public.theme_chat_attachments') is not null as ok;

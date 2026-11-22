/* STORELIB: SAFETY ROUND SQL (library limit of 7, product archive status, account privacy, upload and storage safety). Paste all of it into the Supabase SQL editor and press Run. Each part is safe to run more than once and deletes no data. */

/* ---- RUN_THEME_LIBRARY_LIMIT.sql ---- */
-- ===========================================================================
--  Storelib: a library keeps seven websites, even when two arrive at once
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Adds a trigger, or
--  replaces it with this limit; changes no rows.
--
--  Add theme, Duplicate and Import each count a creator's websites before
--  they insert one. Two of them at the same moment both counted 6 and both
--  inserted, and the library held 8. This makes the database the one that
--  says no: before a website is inserted, it takes a lock for that creator
--  (so their inserts are counted one after another, never side by side),
--  counts, and refuses the insert once there are seven.
--
--  The seven is lib/website-builder/theme-registry.ts THEME_INSTALL_LIMIT
--  (it was five until 2026-11); tests/website-builder.test.ts fails if the
--  two ever differ. The refusal's message is 'library_full', which the
--  routes read as a full library and the page opens its sheet for.
--
--  A library that is already over seven from before the limit keeps every
--  website it has: only an insert is checked.
-- ===========================================================================

create or replace function public.store_theme_installs_library_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kept integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('store_theme_installs:' || new.creator_id::text, 0));
  select count(*) into kept from public.store_theme_installs where creator_id = new.creator_id;
  if kept >= 7 then
    raise exception 'library_full'
      using errcode = 'P0001',
            hint = 'A library keeps 7 websites. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
create trigger store_theme_installs_library_limit
  before insert on public.store_theme_installs
  for each row execute function public.store_theme_installs_library_limit();

notify pgrst, 'reload schema';

select exists (
  select 1 from pg_trigger
  where tgname = 'store_theme_installs_library_limit' and not tgisinternal
) as trigger_present;

/* ---- RUN_PRODUCT_ARCHIVE_STATUS.sql ---- */
-- ===========================================================================
--  Storelib: an archived product is off the page
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: a second run changes
--  nothing.
--
--  Archive on the Products page used to set products.archived and leave the
--  status alone. Everything that shows or sells a product asks for
--  status = 'published', so a live product that was archived stayed on the
--  creator's page and in checkout, under a list that said it was off it.
--  Archive now sets status = 'archived' as well (lib/products/archive.ts).
--
--  This puts the products archived the old way where their creator meant
--  them to be: status 'archived', off every page. Restore on the Products
--  page brings one back as a draft. Products the flag does not mark are
--  not touched.
--
--  Needs 'archived' in products_status_check, which
--  supabase/migrations/20260926_admin_console.sql allows. If this fails
--  with a check violation, run that first.
-- ===========================================================================

update public.products
   set status = 'archived'
 where archived is true and status = 'published';

select count(*) as archived_but_published
  from public.products
 where archived is true and status = 'published';

/* ---- RUN_ACCOUNT_PRIVACY.sql ---- */
-- ===========================================================================
--  Storelib: the privacy switch that is saved, and codes that cannot be guessed
-- ===========================================================================
--  Run once in the Supabase SQL editor (supabase/sql/RUN_ACCOUNT_PRIVACY.sql
--  is the same file). Idempotent. Adds three columns; changes no rows.
--
--  1. profiles.personalized_recommendations
--     The "Personalized recommendations" switch in Settings, Privacy. On by
--     default, as it has always behaved. Explore reads it before it builds
--     "For you" from somebody's purchases and wishlist. Written by the person
--     through the profile update policy that already covers their own row.
--
--  2. email_change_codes.current_email_code
--     Changing the account email now needs a code from the NEW address and a
--     code from the CURRENT one, so a session somebody else got hold of cannot
--     move the account to an address they control. Until this column exists
--     the route falls back to the new address's code alone, as before.
--
--  3. email_change_codes.attempts, account_delete_codes.attempts
--     Wrong guesses are counted. After five the code is thrown away and a new
--     one has to be sent, so a six digit code cannot be walked through.
-- ===========================================================================

alter table public.profiles
  add column if not exists personalized_recommendations boolean not null default true;

alter table public.email_change_codes
  add column if not exists current_email_code text;

alter table public.email_change_codes
  add column if not exists attempts integer not null default 0;

alter table public.account_delete_codes
  add column if not exists attempts integer not null default 0;

/* ---- RUN_UPLOAD_SAFETY.sql ---- */
-- ===========================================================================
--  Storelib: uploads and storage that belong to the person who made them
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: every statement can run
--  again. It deletes NO rows and NO files. It changes who may read and write
--  storage, bucket settings, two functions, and adds indexes and functions
--  for the storage cleanup job.
--
--  WHAT WAS WRONG
--
--  1. public.ensure_storage_rls(bucket) was SECURITY DEFINER and granted to
--     every signed in user. It created, for any bucket named, policies that
--     let ANY signed in user read, overwrite and delete every file in it, and
--     let anonymous visitors read it. The upload routes called it on every
--     upload, so they re-created those policies on digital-products, the
--     private bucket that holds paid files, every time a creator uploaded.
--     Result: anybody with the project's public anon key could download or
--     list every paid file, and any account could delete them.
--
--  2. public.fix_storage_bucket_limit(bucket, limit) was granted to every
--     signed in user too, and creates a missing bucket as PUBLIC.
--
--  3. The public picture buckets let any signed in user overwrite or delete
--     any file in them: one person could replace another's avatar or
--     product photos.
--
--  4. digital_assets let a signed in user insert or update rows with any
--     file_path, bucket, size and scan status: point one of their own
--     products at another creator's paid file, mark an infected file clean,
--     or set every size to 0 and have no quota.
--
--  WHAT THIS DOES
--
--  A. Both functions keep their names and arguments (so an old deployment
--     calling them does not error), ensure_storage_rls does nothing, and only
--     the service role may call either.
--  B. digital-products, product-files and digital-assets are private. Anon
--     gets nothing. A signed in person may write exactly one kind of path in
--     digital-products: the one the server reserved for their pending upload
--     (a digital_assets row of theirs names it), which is how a large file
--     goes up in resumable parts. No listing, no reading anybody's finished
--     files, no deleting. The server reaches the buckets with the service
--     role; buyers get five minute signed URLs from /api/download after the
--     purchase is checked.
--  C. The public picture buckets: anybody can VIEW a file by its public URL
--     (that is what a public bucket is, and no policy is needed for it), but
--     only its owner can upload, replace, list or delete, and only under
--     their own folder: the first folder of the path is their user id or
--     their creator id. Nobody can list anybody else's files.
--  D. The picture buckets only take pictures (and videos, where videos go),
--     so an HTML page or an SVG with a script cannot be served from a public
--     URL. Per bucket size limits.
--  E. digital_assets can only be written by the server. Reading is unchanged.
--  F. Storage usage counts uploads in progress, so a started but never
--     finished upload is not free storage.
--  G. Functions the storage cleanup cron (/api/cron/storage-cleanup) uses to
--     find files that no row refers to any more.
--
--  Every policy this removes is named in the output (NOTICE), so nothing is
--  dropped silently.
--
--  The storage.objects policies (C) are in a block of their own. Creating or
--  dropping a policy needs ownership of storage.objects, which the SQL
--  editor's role may not have; everything else here does not. The paste-ready
--  parts in supabase/sql/run-now/ run that block last, on its own.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- A. The two functions any signed in user could call
-- ---------------------------------------------------------------------------
create or replace function public.ensure_storage_rls(p_bucket_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kept so an older deployment that still calls it gets an answer, not an
  -- error. Policies are set by supabase/migrations/20260929_upload_safety.sql.
  return jsonb_build_object('bucket', p_bucket_id, 'created', '[]'::jsonb, 'note', 'policies are managed by migration');
end;
$$;

revoke all on function public.ensure_storage_rls(text) from public, anon, authenticated;
grant execute on function public.ensure_storage_rls(text) to service_role;

create or replace function public.fix_storage_bucket_limit(p_bucket_id text, p_file_size_limit bigint default 0)
returns void
language plpgsql
security definer
set search_path = storage, public
as $$
begin
  -- Changes the size limit of a bucket that exists. Never creates one, never
  -- changes whether it is public, never touches its allowed types.
  update storage.buckets
     set file_size_limit = nullif(p_file_size_limit, 0)
   where id = p_bucket_id;
end;
$$;

revoke all on function public.fix_storage_bucket_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.fix_storage_bucket_limit(text, bigint) to service_role;


-- ---------------------------------------------------------------------------
-- "Is this path mine": the first folder is my user id, or my creator id
-- ---------------------------------------------------------------------------
create or replace function public.storage_owns_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and position('/' in coalesce(p_name, '')) > 1
     and (
       split_part(p_name, '/', 1) = auth.uid()::text
       or exists (
         select 1 from public.creators c
          where c.user_id = auth.uid()
            and c.id::text = split_part(p_name, '/', 1)
       )
     );
$$;

revoke all on function public.storage_owns_path(text) from public, anon;
grant execute on function public.storage_owns_path(text) to authenticated, service_role;

-- "Is this the path the server reserved for my upload": a digital_assets row
-- of mine, still pending, names exactly this path. This is the only way a
-- signed in person can write into the private bucket, and it is what lets a
-- large file go up by TUS in resumable parts (lib/storage/chunked-upload.ts):
-- the server chose the path in /api/v2/upload/prepare, counted it against the
-- quota, and checks the real size and bytes in /complete. Once the upload is
-- completed the path is no longer theirs to write, read or list.
--
-- plpgsql, not sql: a sql function's body is checked against the tables when
-- it is created, so on a database without digital_assets the create itself
-- failed, and with it the whole paste. Here the table is only read once the
-- guard has said it exists.
create or replace function public.storage_reserved_upload(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or to_regclass('public.digital_assets') is null then
    return false;
  end if;
  return exists (
    select 1 from public.digital_assets da
     where da.file_path = p_name
       and coalesce(da.storage_bucket, 'digital-products') = p_bucket
       and da.uploaded_by = auth.uid()
       and da.upload_status = 'pending'
  );
end;
$$;

revoke all on function public.storage_reserved_upload(text, text) from public, anon;
grant execute on function public.storage_reserved_upload(text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- B, D. Buckets: private ones private, public ones public with type and size
-- limits. Writing storage.buckets needs privileges on it, not ownership.
-- ---------------------------------------------------------------------------
do $$
declare
  private_buckets text[] := array['digital-products', 'product-files', 'digital-assets'];
  image_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  video_types text[] := array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg',
                              'video/3gpp', 'video/ogg', 'video/x-matroska', 'video/avi', 'video/mov'];
  -- A link page shares files of every kind, so this list is long; what it
  -- leaves out is anything a browser renders as a page: text/html, SVG, XML
  -- and scripts. application/octet-stream is in, and is always a download.
  lead_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
                             'video/*', 'audio/*', 'font/*',
                             'application/pdf', 'application/zip', 'application/x-zip-compressed',
                             'application/epub+zip', 'application/x-mobipocket-ebook',
                             'application/octet-stream', 'text/plain', 'text/csv', 'text/markdown',
                             'application/rtf', 'application/msword', 'application/vnd.ms-excel',
                             'application/vnd.ms-powerpoint',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                             'application/vnd.oasis.opendocument.text',
                             'application/vnd.oasis.opendocument.spreadsheet',
                             'application/vnd.rar', 'application/x-rar-compressed', 'application/x-7z-compressed',
                             'application/gzip', 'application/x-tar', 'application/json',
                             'image/vnd.adobe.photoshop', 'application/postscript', 'application/illustrator',
                             'model/stl', 'model/obj', 'model/gltf-binary', 'application/x-blender'];
  b text;
begin
  foreach b in array private_buckets loop
    update storage.buckets set public = false where id = b;
  end loop;
  insert into storage.buckets (id, name, public) values ('digital-products', 'digital-products', false)
    on conflict (id) do update set public = false;

  foreach b in array array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets',
                           'lead-form-files-v2', 'product-videos', 'email-images'] loop
    insert into storage.buckets (id, name, public) values (b, b, true) on conflict (id) do nothing;
  end loop;

  update storage.buckets set public = true, allowed_mime_types = image_types, file_size_limit = 26214400
   where id in ('product-images', 'avatars', 'covers');
  update storage.buckets set public = true, allowed_mime_types = image_types, file_size_limit = 5242880
   where id = 'email-images';
  update storage.buckets set public = true, allowed_mime_types = image_types || video_types
   where id in ('store-builder-images', 'onepage-assets', 'product-videos');
  update storage.buckets set allowed_mime_types = lead_types
   where id in ('lead-form-files-v2', 'lead-form-files');
end;
$$;


-- ---------------------------------------------------------------------------
-- C. The storage.objects policies. Needs ownership of storage.objects.
-- ---------------------------------------------------------------------------
-- Seven policies in all, each naming its buckets in one list, so the same set
-- can be typed into Storage > Policies in the dashboard when the SQL editor's
-- role does not own storage.objects (supabase/sql/run-now/README.md).
do $$
declare
  private_buckets text[] := array['digital-products', 'product-files', 'digital-assets'];
  public_buckets  text[] := array['product-images', 'avatars', 'covers', 'store-builder-images',
                                  'onepage-assets', 'lead-form-files-v2', 'lead-form-files',
                                  'product-videos', 'email-images'];
  managed text[];
  public_list text;
  owner_expr text;
  pol record;
  b text;
  mentions text;
  unmanaged text;
begin
  managed := private_buckets || public_buckets;
  select string_agg(quote_literal(x), ', ') into public_list from unnest(public_buckets) as x;

  -- The owner column is `owner_id` (text) on current storage, `owner` (uuid)
  -- on older projects. Either is set by storage to the uploader's user id.
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    owner_expr := 'owner_id = (select auth.uid())::text';
  else
    owner_expr := 'owner = (select auth.uid())';
  end if;

  -- Every policy on storage.objects that lets anon or signed in users at a
  -- managed bucket, or at every bucket (no bucket_id in it at all), goes.
  for pol in
    select policyname, roles, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  loop
    continue when pol.roles <@ array['service_role']::name[];
    continue when pol.policyname like 'storelib owner %';

    mentions := null;
    foreach b in array managed loop
      if position(quote_literal(b) in pol.body) > 0 then
        mentions := b;
        exit;
      end if;
    end loop;

    if mentions is not null or position('bucket_id' in pol.body) = 0 then
      select string_agg(distinct m[1], ', ') into unmanaged
        from regexp_matches(pol.body, '''([^'']+)''::text', 'g') as m
       where not (m[1] = any(managed))
         and exists (select 1 from storage.buckets sb where sb.id = m[1]);
      execute format('drop policy %I on storage.objects', pol.policyname);
      raise notice 'dropped storage policy "%" (%, roles %)%', pol.policyname, pol.cmd, pol.roles,
        case when unmanaged is not null then ' - it also named: ' || unmanaged || ', check those buckets still work' else '' end;
    end if;
  end loop;

  -- Ours are replaced whole, including the one-set-per-bucket ones an earlier
  -- version of this file made.
  for pol in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'storelib owner %'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  -- The public buckets: the owner may read, upload, replace and delete, and
  -- only under their own folder. No anon policy: a public bucket serves its
  -- files by URL without one, and a SELECT policy for anon would only add the
  -- ability to LIST everybody's files.
  execute format(
    'create policy %I on storage.objects for select to authenticated using (bucket_id = any (array[%s]) and (public.storage_owns_path(name) or %s))',
    'storelib owner read public buckets', public_list, owner_expr);
  execute format(
    'create policy %I on storage.objects for insert to authenticated with check (bucket_id = any (array[%s]) and public.storage_owns_path(name))',
    'storelib owner insert public buckets', public_list);
  execute format(
    'create policy %I on storage.objects for update to authenticated using (bucket_id = any (array[%s]) and (public.storage_owns_path(name) or %s)) with check (bucket_id = any (array[%s]) and (public.storage_owns_path(name) or %s))',
    'storelib owner update public buckets', public_list, owner_expr, public_list, owner_expr);
  execute format(
    'create policy %I on storage.objects for delete to authenticated using (bucket_id = any (array[%s]) and (public.storage_owns_path(name) or %s))',
    'storelib owner delete public buckets', public_list, owner_expr);

  -- The private bucket: a signed in person may write one path only, the one
  -- reserved for their pending upload, and read it back while it is pending
  -- (a resumed upload asks how far it got). No delete, no list, nothing else.
  create policy "storelib owner reserved read digital-products" on storage.objects
    for select to authenticated
    using (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
  create policy "storelib owner reserved insert digital-products" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
  create policy "storelib owner reserved update digital-products" on storage.objects
    for update to authenticated
    using (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name))
    with check (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
end;
$$;


-- ---------------------------------------------------------------------------
-- E. digital_assets: written by the server only
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
  role_list text;
begin
  if to_regclass('public.digital_assets') is null then
    raise notice 'skipping digital_assets: the table does not exist here';
    return;
  end if;

  alter table public.digital_assets enable row level security;

  for pol in
    select policyname, roles, cmd, qual
      from pg_policies
     where schemaname = 'public' and tablename = 'digital_assets'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles <@ array['service_role']::name[])
  loop
    execute format('drop policy %I on public.digital_assets', pol.policyname);
    raise notice 'dropped digital_assets policy "%" (%)', pol.policyname, pol.cmd;
    -- An ALL policy also let people READ; that part is kept, as its own policy.
    if pol.cmd = 'ALL' and pol.qual is not null then
      select string_agg(quote_ident(r), ', ') into role_list from unnest(pol.roles) as r;
      if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = left(pol.policyname, 55) || ' (read)') then
        execute format('drop policy %I on public.digital_assets', left(pol.policyname, 55) || ' (read)');
      end if;
      execute format('create policy %I on public.digital_assets for select to %s using (%s)',
                     left(pol.policyname, 55) || ' (read)', role_list, pol.qual);
    end if;
  end loop;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = 'Creators can view their digital_assets') then
    create policy "Creators can view their digital_assets"
      on public.digital_assets for select to authenticated
      using (product_id in (
        select p.id from public.products p
          join public.creators c on p.creator_id = c.id
         where c.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = 'Service role full access digital_assets') then
    create policy "Service role full access digital_assets"
      on public.digital_assets for all to service_role using (true) with check (true);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- F. Storage usage counts uploads in progress
-- ---------------------------------------------------------------------------
-- plpgsql for the same reason as storage_reserved_upload: without
-- digital_assets a sql body cannot even be created.
create or replace function public.get_creator_storage_usage(p_creator_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('public.digital_assets') is null then
    return 0;
  end if;
  return (
    select coalesce(sum(da.file_size), 0)::bigint
      from public.digital_assets da
      join public.products p on da.product_id = p.id
     where p.creator_id = p_creator_id
       and coalesce(da.upload_status, 'completed') in ('pending', 'completed')
  );
end;
$$;

-- Somebody else's usage is not a signed in user's business.
revoke all on function public.get_creator_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.get_creator_storage_usage(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- Indexes the upload checks and the cleanup read
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.digital_assets') is not null then
    create index if not exists idx_digital_assets_file_path on public.digital_assets (file_path);
    create index if not exists idx_digital_assets_pending
      on public.digital_assets (created_at) where upload_status in ('pending', 'failed');
    create index if not exists idx_digital_assets_product_status on public.digital_assets (product_id, upload_status);
  end if;
  if to_regclass('public.product_bundles') is not null then
    create index if not exists idx_product_bundles_zip_path on public.product_bundles (zip_path);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- G. What the cleanup job may delete
-- ---------------------------------------------------------------------------
-- Whether any row still refers to a public picture, by its path appearing
-- anywhere in the row. Scoped to the owner the path names (a creator id or a
-- user id), so it reads only that person's rows, in EVERY table that has an
-- owner column: creator_id, owner_id or user_id directly, and product_id,
-- install_id or site_id through the products, theme installs and sites that
-- are theirs. Found by reading the catalogue, so a table added next month is
-- covered without anybody remembering this function. Append-only logs that
-- never hold a picture are skipped because they are the big ones.
--
-- It errs one way only: anything it cannot read (a column of an unexpected
-- type, a path it does not understand) counts as "still referenced", and the
-- file is kept.
create or replace function public.storage_object_referenced(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_key text := split_part(p_name, '/', 1);
  pattern text;
  v_creator uuid;
  v_user uuid;
  t record;
  q text;
  found boolean := false;
  skip text[] := array['rate_limit_hits', 'download_events', 'upload_events', 'product_views',
                       'product_analytics_daily', 'analytics_daily_rollups', 'security_events',
                       'email_events', 'email_logs', 'email_usage', 'ledger_events', 'seller_ledger',
                       'signup_attempts', 'site_web_vitals', 'blog_post_views', 'message_push_log',
                       'flow_execution_log', 'campaign_recipients', 'account_delete_codes',
                       'oauth_bridge_tokens', 'profile_username_history', 'username_history',
                       'website_address_history', 'admin_actions', 'admin_moderation_log'];
begin
  if owner_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return true;
  end if;
  -- LIKE treats _ and % as wildcards; a path is matched as the text it is.
  pattern := '%' || replace(replace(replace(p_name, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select c.id, c.user_id into v_creator, v_user
    from public.creators c
   where c.id = owner_key::uuid or c.user_id = owner_key::uuid
   limit 1;
  if v_creator is null then
    v_user := owner_key::uuid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select exists (select 1 from public.profiles x where x.id = $1 and x::text like $2)'
      into found using v_user, pattern;
    if found then return true; end if;
  end if;

  for t in
    select c.table_name, c.column_name, (c.data_type = 'uuid') as is_uuid
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
       and c.column_name in ('creator_id', 'owner_id', 'user_id', 'product_id', 'install_id', 'site_id')
       and not (c.table_name = any(skip))
     order by c.table_name, c.column_name
  loop
    -- A uuid column is compared as a uuid, so its index is used; a column of
    -- any other type is compared as text rather than failing.
    q := case
      when t.column_name = 'creator_id' and v_creator is not null then
        format('select exists (select 1 from public.%I x where x.creator_id%s = $1%s and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name in ('owner_id', 'user_id') and v_user is not null then
        format('select exists (select 1 from public.%I x where x.%I%s = $2%s and x::text like $3)',
               t.table_name, t.column_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'product_id' and v_creator is not null and to_regclass('public.products') is not null then
        format('select exists (select 1 from public.%I x join public.products p on p.id%s = x.product_id%s where p.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'install_id' and v_creator is not null and to_regclass('public.store_theme_installs') is not null then
        format('select exists (select 1 from public.%I x join public.store_theme_installs i on i.id%s = x.install_id%s where i.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'site_id' and v_creator is not null and to_regclass('public.sites') is not null then
        format('select exists (select 1 from public.%I x join public.sites s on s.id%s = x.site_id%s where s.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      else null
    end;
    continue when q is null;
    begin
      execute q into found using v_creator, v_user, pattern;
    exception when others then
      found := true; -- could not read it, so keep the file
    end;
    if found then return true; end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.storage_object_referenced(text, text) from public, anon, authenticated;
grant execute on function public.storage_object_referenced(text, text) to service_role;

-- The candidates, oldest first, at most p_limit. Four kinds, each with its
-- own age and its own test of "nothing refers to it":
--
--   theme-import        a theme package waiting to be imported, older than a
--                       day. The import deletes it when it is done; one still
--                       there was abandoned.
--   digital-orphan      a private file under a creator's digital-products
--                       folder that no digital_assets row names, three days
--                       after it was uploaded.
--   bundle-orphan       a download ZIP no product_bundles row names.
--   description-image   a picture uploaded into a product description that
--                       no longer appears in any of that creator's rows,
--                       fourteen days on.
--   removed-image       a product photo under a creator's product folder that
--                       none of their rows mention any more. Only those
--                       uploaded between p_image_from_days and 30 days ago,
--                       so each run reads a bounded slice; a wider backfill
--                       is a manual run with a larger p_image_from_days.
--
-- plpgsql, not sql: a sql body naming product_bundles could not be created
-- on a database without that table, which failed the whole paste and took
-- the storage fixes above down with it. Without either table there is
-- nothing to compare against, so it offers nothing to delete.
create or replace function public.storage_cleanup_candidates(p_limit integer default 200, p_image_from_days integer default 32)
returns table (bucket_id text, name text, reason text)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if to_regclass('public.digital_assets') is null or to_regclass('public.product_bundles') is null then
    return;
  end if;
  return query
  with imports as (
    select o.bucket_id::text, o.name::text, 'theme-import'::text as reason, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name ~ '^[0-9a-fA-F-]{36}/theme-imports/[0-9a-fA-F-]{36}\.zip$'
       and o.created_at < now() - interval '1 day'
     order by o.created_at
     limit p_limit
  ),
  digital as (
    select o.bucket_id::text, o.name::text, 'digital-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id in ('digital-products', 'product-files')
       and (o.name like '%/digital-products/%' or o.name like 'products/%')
       and o.created_at < now() - interval '3 days'
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path in (o.name, o.bucket_id || '/' || o.name)
       )
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path like '%://%' and position(o.name in da.file_path) > 0
       )
     order by o.created_at
     limit p_limit
  ),
  bundles as (
    select o.bucket_id::text, o.name::text, 'bundle-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name like '%/bundles/%.zip'
       and o.created_at < now() - interval '3 days'
       and not exists (select 1 from public.product_bundles pb where pb.zip_path = o.name)
     order by o.created_at
     limit p_limit
  ),
  descriptions as (
    select o.bucket_id::text, o.name::text, 'description-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '14 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 15))
       and not public.storage_object_referenced(o.bucket_id, o.name)
     order by o.created_at
     limit p_limit
  ),
  removed as (
    select o.bucket_id::text, o.name::text, 'removed-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name ~ '^[0-9a-fA-F-]{36}/([0-9a-fA-F-]{36}|temp)/'
       and o.name not like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '30 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 31))
       and not public.storage_object_referenced(o.bucket_id, o.name)
     order by o.created_at
     limit p_limit
  )
  select c.bucket_id, c.name, c.reason
    from (
      select * from imports
      union all select * from digital
      union all select * from bundles
      union all select * from descriptions
      union all select * from removed
    ) c
   order by c.created_at
   limit p_limit;
end;
$$;

revoke all on function public.storage_cleanup_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.storage_cleanup_candidates(integer, integer) to service_role;


-- ---------------------------------------------------------------------------
-- H. Pictures uploaded straight from a browser, for the metadata sweep
-- ---------------------------------------------------------------------------
-- Most pictures go from the page straight into a public bucket, so no server
-- sees them on the way. /api/cron/strip-image-metadata reads the recent ones
-- from this list every hour and rewrites any that still carry EXIF, GPS or
-- XMP, at the same URL (lib/storage/metadata-sweep.ts).
create or replace function public.storage_recent_public_images(p_since_minutes integer default 150, p_limit integer default 200)
returns table (bucket_id text, name text, size bigint, mimetype text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0),
         coalesce(o.metadata->>'mimetype', '')
    from storage.objects o
   where o.bucket_id in ('avatars', 'covers', 'product-images', 'store-builder-images',
                         'onepage-assets', 'lead-form-files-v2', 'product-videos')
     and o.created_at > now() - make_interval(mins => greatest(p_since_minutes, 1))
     and lower(coalesce(o.metadata->>'mimetype', '')) in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')
     and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 26214400
   order by o.created_at
   limit greatest(p_limit, 1);
$$;

revoke all on function public.storage_recent_public_images(integer, integer) from public, anon, authenticated;
grant execute on function public.storage_recent_public_images(integer, integer) to service_role;


-- ---------------------------------------------------------------------------
-- What is left. Every row here should be a policy named "storelib owner ..."
-- for a public bucket, or one for a bucket this file does not manage.
-- ---------------------------------------------------------------------------
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;

select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 order by id;

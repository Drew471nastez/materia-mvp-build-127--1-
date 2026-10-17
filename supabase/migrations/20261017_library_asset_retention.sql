/* ===========================================================================
   REMOVING A PICTURE FROM FILES MUST NOT EMPTY A LIVE PAGE
   ===========================================================================
   Files (/app/files, lib/files/library.ts) listed and deleted storage objects
   straight, so "Delete" was a hard delete of the only copy. A logo removed
   there disappeared from the store header, the receipts, the checkout and the
   website at the same moment, with nothing to put back.

   library_assets is the asset's identity and its removal ledger:

     owner_user_id      the store-builder-images folder this path sits in
     owner_creator_id   the product-images folder this path sits in
     bucket, path       the object, one row per object (unique)
     removed_at         taken out of the Files list (a logical delete). The
                        object itself is untouched, so everything that still
                        points at it keeps drawing.
     purge_after        the earliest the bytes may be collected, 30 days on
     purged_at          the bytes are gone, collected by the daily cron only
                        after a reference check said nothing points at it
     uses_at_removal    how many places were using it when it was removed,
                        for the report, never for the decision

   Nothing but service_role reads or writes it: row level security is on and
   there is no policy, so a signed in user cannot see another store's paths.
   The library's own reads already run through the admin client filtered by
   the caller's own folder (lib/physical/auth.ts shopCaller).

   Safe to run twice. Nothing in it drops or deletes anything.
   =========================================================================== */

create table if not exists public.library_assets (id uuid not null default gen_random_uuid(), owner_user_id uuid, owner_creator_id uuid, bucket text not null, path text not null, bytes bigint, mime text, uses_at_removal integer, removed_at timestamptz, purge_after timestamptz, purged_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint library_assets_pkey primary key (id), constraint library_assets_bucket_check check (bucket in ('store-builder-images', 'product-images')), constraint library_assets_path_check check (char_length(path) between 3 and 300));

alter table public.library_assets add column if not exists owner_user_id uuid;
alter table public.library_assets add column if not exists owner_creator_id uuid;
alter table public.library_assets add column if not exists bytes bigint;
alter table public.library_assets add column if not exists mime text;
alter table public.library_assets add column if not exists uses_at_removal integer;
alter table public.library_assets add column if not exists removed_at timestamptz;
alter table public.library_assets add column if not exists purge_after timestamptz;
alter table public.library_assets add column if not exists purged_at timestamptz;
alter table public.library_assets add column if not exists updated_at timestamptz not null default now();

create unique index if not exists library_assets_object_key on public.library_assets (bucket, path);
create index if not exists library_assets_owner_user_idx on public.library_assets (owner_user_id, removed_at);
create index if not exists library_assets_owner_creator_idx on public.library_assets (owner_creator_id, removed_at);
create index if not exists library_assets_purge_idx on public.library_assets (purge_after) where purged_at is null;

alter table public.library_assets enable row level security;

revoke all on public.library_assets from public, anon, authenticated;
grant select, insert, update, delete on public.library_assets to service_role;
notify pgrst, 'reload schema';

/* Removing a picture from Files must not empty a live page (round 27): `library_assets`, one row per picture or video in a store's Files library, holding which folder it belongs to, when it was taken out of the list (`removed_at`, a logical delete that leaves the object itself alone, so a store logo, a receipt, a website section, a product photo or a checkout icon that still points at it keeps drawing), the earliest its bytes may be collected (`purge_after`, thirty days on), and when they were (`purged_at`, written only by the daily cron and only after `public.storage_object_referenced` from part 18 said nothing points at it). Row level security on with no policy and no grant to anon or authenticated, so nobody but the server's own key can read a store's paths; Files already reads through that key filtered by the caller's own folder. No existing row or object changes. Until it runs, Files refuses to remove a picture that anything still points at and says it needs this part, and removes one that nothing points at as before: it never deletes something in use. Runs on its own. Safe to run again. */
CREATE TABLE IF NOT EXISTS public.library_assets (id uuid NOT NULL DEFAULT gen_random_uuid(), owner_user_id uuid, owner_creator_id uuid, bucket text NOT NULL, path text NOT NULL, bytes bigint, mime text, uses_at_removal integer, removed_at timestamptz, purge_after timestamptz, purged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT library_assets_pkey PRIMARY KEY (id), CONSTRAINT library_assets_bucket_check CHECK (bucket IN ('store-builder-images', 'product-images')), CONSTRAINT library_assets_path_check CHECK (char_length(path) BETWEEN 3 AND 300));
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS owner_creator_id uuid;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS bytes bigint;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS mime text;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS uses_at_removal integer;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS purge_after timestamptz;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS purged_at timestamptz;
ALTER TABLE public.library_assets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS library_assets_object_key ON public.library_assets (bucket, path);
CREATE INDEX IF NOT EXISTS library_assets_owner_user_idx ON public.library_assets (owner_user_id, removed_at);
CREATE INDEX IF NOT EXISTS library_assets_owner_creator_idx ON public.library_assets (owner_creator_id, removed_at);
CREATE INDEX IF NOT EXISTS library_assets_purge_idx ON public.library_assets (purge_after) WHERE purged_at IS NULL;
ALTER TABLE public.library_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.library_assets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_assets TO service_role;
notify pgrst, 'reload schema';

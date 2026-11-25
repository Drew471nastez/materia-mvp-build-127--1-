-- ===========================================================================
--  STORELIB: WHAT ROUND 27 NEEDS ON PRODUCTION (a website's unchanged theme
--  files kept once, for every website)
-- ===========================================================================
--  Paste all of it into the Supabase SQL editor and press Run. Safe to run
--  twice: every part checks before it creates or changes anything. It
--  deletes no data and changes no existing row.
--
--  Needs part 180 (site releases: theme_file_blobs) and the theme tables.
--  Without them it skips itself with a notice.
--
--  WHAT IT ADDS
--    store_theme_custom_files.blob_sha256   null on every existing row. A row
--        whose content is '' and which names a blob is a REFERENCE: its text
--        is the blob's (lib/website-builder/theme-file-refs.ts). A row with
--        text is its own copy, whatever it names.
--    a foreign key to theme_file_blobs, so a referenced text cannot go.
--    a trigger: any write that puts text in a row clears blob_sha256, so
--        editing a referenced file makes it the creator's own copy (copy on
--        write), for every writer, old or new.
--    a second trigger: a reference added, removed or pointed at other text
--        lets go of the live release pointer (site_live_releases), as part
--        180's site_live_release_forget does for text, so the live website
--        is drawn from its rows until the next Publish. Part 180's own
--        trigger ignores rows with no text, which a reference is.
--
--  ONCE THIS HAS RUN every read of theme files also asks for blob_sha256
--  (each server checks once that the column is there) and resolves a
--  reference wherever there is one. Existing rows are all null, so every
--  website draws exactly as before. New websites are WRITTEN as references
--  only when STORELIB_THEME_FILE_REFS=1 is set on Vercel; turning that off
--  later stops new references and never hides a file of a website that has
--  them.
-- ===========================================================================

DO $do$
BEGIN
  IF to_regclass('public.store_theme_custom_files') IS NULL OR to_regclass('public.theme_file_blobs') IS NULL THEN
    RAISE NOTICE 'round 27: store_theme_custom_files or theme_file_blobs (part 180) is missing; nothing was changed. Run those first, then this again.';
    RETURN;
  END IF;

  ALTER TABLE public.store_theme_custom_files ADD COLUMN IF NOT EXISTS blob_sha256 text;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_theme_custom_files_blob_sha256_fkey') THEN
    ALTER TABLE public.store_theme_custom_files
      ADD CONSTRAINT store_theme_custom_files_blob_sha256_fkey
      FOREIGN KEY (blob_sha256) REFERENCES public.theme_file_blobs (sha256) ON DELETE RESTRICT NOT VALID;
  END IF;
  /* Every existing row is null, so this checks nothing old and takes a moment. */
  ALTER TABLE public.store_theme_custom_files VALIDATE CONSTRAINT store_theme_custom_files_blob_sha256_fkey;

  CREATE INDEX IF NOT EXISTS idx_stcf_blob_sha256 ON public.store_theme_custom_files (blob_sha256) WHERE blob_sha256 IS NOT NULL;
END $do$;

CREATE OR REPLACE FUNCTION public.store_theme_file_own_copy() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  /* Text written into a row: it is the creator's own copy now. A write of '' (a reference written as one) keeps what it names. */
  IF NEW.blob_sha256 IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content AND coalesce(NEW.content, '') <> '' THEN
    NEW.blob_sha256 := NULL;
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.store_theme_file_own_copy() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF to_regclass('public.store_theme_custom_files') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_theme_custom_files' AND column_name = 'blob_sha256') THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS store_theme_file_own_copy ON public.store_theme_custom_files;
  CREATE TRIGGER store_theme_file_own_copy BEFORE UPDATE OF content ON public.store_theme_custom_files
    FOR EACH ROW EXECUTE FUNCTION public.store_theme_file_own_copy();
END $do$;

CREATE OR REPLACE FUNCTION public.store_theme_file_ref_forget() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_install uuid;
BEGIN
  IF to_regclass('public.site_live_releases') IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.blob_sha256 IS NULL THEN RETURN NULL; END IF;
    v_install := NEW.install_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.blob_sha256 IS NULL OR coalesce(OLD.content, '') <> '' THEN RETURN NULL; END IF;
    v_install := OLD.install_id;
  ELSE
    IF NEW.blob_sha256 IS NOT DISTINCT FROM OLD.blob_sha256 THEN RETURN NULL; END IF;
    /* Text written in place of a reference: part 180's own trigger already counted that change. */
    IF coalesce(NEW.content, '') <> '' AND NEW.content IS DISTINCT FROM OLD.content THEN RETURN NULL; END IF;
    v_install := NEW.install_id;
  END IF;
  UPDATE public.site_live_releases SET release_id = NULL, rev = rev + 1, updated_at = now() WHERE install_id = v_install;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public.store_theme_file_ref_forget() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF to_regclass('public.store_theme_custom_files') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_theme_custom_files' AND column_name = 'blob_sha256') THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS store_theme_file_ref_forget ON public.store_theme_custom_files;
  CREATE TRIGGER store_theme_file_ref_forget AFTER INSERT OR DELETE OR UPDATE OF blob_sha256 ON public.store_theme_custom_files
    FOR EACH ROW EXECUTE FUNCTION public.store_theme_file_ref_forget();
END $do$;

notify pgrst, 'reload schema';

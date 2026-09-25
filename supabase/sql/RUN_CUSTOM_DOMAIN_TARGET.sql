-- ===========================================================================
--  WHAT A CONNECTED DOMAIN SHOWS
-- ===========================================================================
--  Paste into the Supabase SQL editor and run. The same as
--  supabase/migrations/20261001_custom_domain_target.sql.
--  Safe to run more than once.
--
--  A creator chooses what their domain shows: their website, their creator
--  page (storelib.com/<username>) or their OnePage. Every existing domain is
--  'website', which is what they showed before this column: the published
--  website, or the creator page while no website is live (proxy.ts,
--  lib/custom-domain/routing.ts).
--
--  Guarded, because custom_domains is created by an older migration
--  (20260211) and a paste that stops at the first error would take the rest
--  of the paste with it.
--
--  Until this has been run, every domain shows the website as before and
--  Settings says the choice cannot be saved yet.
-- ===========================================================================

DO $custom_domains_target$
BEGIN
  IF to_regclass('public.custom_domains') IS NULL THEN
    RAISE NOTICE 'custom_domains not present; skipping the target column';
    RETURN;
  END IF;
  ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT 'website';
  ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_target_check;
  ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_target_check CHECK (target IN ('website', 'creator_page', 'onepage'));
END;
$custom_domains_target$;

NOTIFY pgrst, 'reload schema';

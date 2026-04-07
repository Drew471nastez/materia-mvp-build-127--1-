-- ============================================================
-- Harden public read access for published website-builder themes
-- ============================================================
-- The original 20260318 migration added SELECT policies for published
-- rows, but they were created without IF NOT EXISTS and were easy to
-- miss on existing environments. This migration is idempotent and
-- guarantees every visitor on the internet can read:
--   • the published store_theme_installs row
--   • its joined store_theme_settings row
--   • its joined store_theme_pages sections
--
-- Run this against every environment that serves the public website
-- routes (`/[sellername]` and `/w/[username]`).

-- 1) Make sure RLS is on (already should be, but be explicit)
ALTER TABLE IF EXISTS public.store_theme_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_theme_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.store_theme_pages    ENABLE ROW LEVEL SECURITY;

-- 2) Drop any old versions of the public policies so we can recreate
--    them cleanly (idempotent).
DROP POLICY IF EXISTS "sti_select_published" ON public.store_theme_installs;
DROP POLICY IF EXISTS "sts_select_published" ON public.store_theme_settings;
DROP POLICY IF EXISTS "stp_select_published" ON public.store_theme_pages;

-- 3) Public read for published installs
CREATE POLICY "sti_select_published"
  ON public.store_theme_installs
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- 4) Public read for settings rows attached to a published install
CREATE POLICY "sts_select_published"
  ON public.store_theme_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    install_id IN (
      SELECT id FROM public.store_theme_installs WHERE status = 'published'
    )
  );

-- 5) Public read for page sections attached to a published install
CREATE POLICY "stp_select_published"
  ON public.store_theme_pages
  FOR SELECT
  TO anon, authenticated
  USING (
    install_id IN (
      SELECT id FROM public.store_theme_installs WHERE status = 'published'
    )
  );

-- 6) Make sure the anon and authenticated roles actually have the
--    underlying SELECT grant — RLS sits on top of GRANTs.
GRANT SELECT ON public.store_theme_installs TO anon, authenticated;
GRANT SELECT ON public.store_theme_settings TO anon, authenticated;
GRANT SELECT ON public.store_theme_pages    TO anon, authenticated;

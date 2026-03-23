-- ============================================================
-- Public read access for published website builder themes
-- ============================================================
-- Visitors need to read published themes, settings, and page
-- sections to render the live store website. Without these
-- policies, RLS blocks all anonymous/visitor reads and the
-- published website shows nothing.

-- 1. store_theme_installs — allow public to see published installs
CREATE POLICY "sti_select_published" ON store_theme_installs
  FOR SELECT USING (status = 'published');

-- 2. store_theme_settings — allow public to read settings for published installs
CREATE POLICY "sts_select_published" ON store_theme_settings
  FOR SELECT USING (
    install_id IN (
      SELECT id FROM store_theme_installs WHERE status = 'published'
    )
  );

-- 3. store_theme_pages — allow public to read sections for published installs
CREATE POLICY "stp_select_published" ON store_theme_pages
  FOR SELECT USING (
    install_id IN (
      SELECT id FROM store_theme_installs WHERE status = 'published'
    )
  );

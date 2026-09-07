-- ============================================================
-- Website Builder: Full Theme Management System
-- ============================================================

-- ── 1. themes ────────────────────────────────────────────────
-- Master catalogue of theme definitions (built-in + future marketplace)
CREATE TABLE IF NOT EXISTS themes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  description    TEXT,
  preview_image_url TEXT,
  author         TEXT NOT NULL DEFAULT 'Storelib',
  version        TEXT NOT NULL DEFAULT '1.0.0',
  is_built_in    BOOLEAN NOT NULL DEFAULT false,
  is_free        BOOLEAN NOT NULL DEFAULT true,
  price_cents    INTEGER NOT NULL DEFAULT 0,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  category       TEXT DEFAULT 'general',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. store_theme_installs ──────────────────────────────────
-- Themes installed per creator/store. A creator can install many themes;
-- only one may be 'published' (live) at a time.
CREATE TABLE IF NOT EXISTS store_theme_installs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  theme_id         UUID NOT NULL REFERENCES themes(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'unpublished')),
  is_custom        BOOLEAN NOT NULL DEFAULT false,
  parent_install_id UUID REFERENCES store_theme_installs(id) ON DELETE SET NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sti_creator_id   ON store_theme_installs(creator_id);
CREATE INDEX IF NOT EXISTS idx_sti_theme_id     ON store_theme_installs(theme_id);
CREATE INDEX IF NOT EXISTS idx_sti_status       ON store_theme_installs(status);

-- Enforce: at most one published theme per creator
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sti_creator_published
  ON store_theme_installs(creator_id)
  WHERE status = 'published';

-- ── 3. store_theme_settings ──────────────────────────────────
-- Global theme-level settings (colors, fonts, logo, etc.) per install.
-- draft_settings holds unsaved visual-editor changes.
CREATE TABLE IF NOT EXISTS store_theme_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id     UUID NOT NULL UNIQUE REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  settings       JSONB NOT NULL DEFAULT '{}',
  draft_settings JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. store_theme_pages ─────────────────────────────────────
-- Per-page section layout for each install.
-- sections = published section array; draft_sections = unsaved editor state.
CREATE TABLE IF NOT EXISTS store_theme_pages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id      UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  page_key        TEXT NOT NULL,   -- 'home' | 'product' | 'about' | 'contact'
  sections        JSONB NOT NULL DEFAULT '[]',
  draft_sections  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(install_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_stp_install_id ON store_theme_pages(install_id);

-- ── 5. store_theme_custom_files ──────────────────────────────
-- Code-editor overrides: stores creator edits to theme JSON files.
-- When a file exists here it shadows the built-in theme file.
CREATE TABLE IF NOT EXISTS store_theme_custom_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id  UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(install_id, path)
);

CREATE INDEX IF NOT EXISTS idx_stcf_install_id ON store_theme_custom_files(install_id);

-- ── 6. theme_publish_history ─────────────────────────────────
-- Audit log of every publish/unpublish action.
CREATE TABLE IF NOT EXISTS theme_publish_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id  UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN ('published', 'unpublished', 'draft')),
  snapshot    JSONB,  -- settings snapshot at publish time
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 7. RLS Policies ──────────────────────────────────────────
--
-- Each CREATE POLICY is guarded rather than dropped-and-recreated.
-- This file has to be safe to re-run against a database that already
-- has these tables, and DROP POLICY on a live table opens a window —
-- however short — where the table is readable by anyone the GRANTs
-- allow. A skip has no such window.

-- themes: public read, no write from clients
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
DO $pol_themes_select_all$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'themes' AND policyname = 'themes_select_all') THEN
  CREATE POLICY "themes_select_all" ON themes FOR SELECT USING (true);
  END IF;
END;
$pol_themes_select_all$;

-- store_theme_installs
ALTER TABLE store_theme_installs ENABLE ROW LEVEL SECURITY;

DO $pol_sti_select_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_installs' AND policyname = 'sti_select_own') THEN
  CREATE POLICY "sti_select_own" ON store_theme_installs
    FOR SELECT USING (
      creator_id IN (
        SELECT id FROM creators WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sti_select_own$;

DO $pol_sti_insert_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_installs' AND policyname = 'sti_insert_own') THEN
  CREATE POLICY "sti_insert_own" ON store_theme_installs
    FOR INSERT WITH CHECK (
      creator_id IN (
        SELECT id FROM creators WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sti_insert_own$;

DO $pol_sti_update_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_installs' AND policyname = 'sti_update_own') THEN
  CREATE POLICY "sti_update_own" ON store_theme_installs
    FOR UPDATE USING (
      creator_id IN (
        SELECT id FROM creators WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sti_update_own$;

DO $pol_sti_delete_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_installs' AND policyname = 'sti_delete_own') THEN
  CREATE POLICY "sti_delete_own" ON store_theme_installs
    FOR DELETE USING (
      creator_id IN (
        SELECT id FROM creators WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sti_delete_own$;

-- store_theme_settings
ALTER TABLE store_theme_settings ENABLE ROW LEVEL SECURITY;

DO $pol_sts_select_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_settings' AND policyname = 'sts_select_own') THEN
  CREATE POLICY "sts_select_own" ON store_theme_settings
    FOR SELECT USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sts_select_own$;

DO $pol_sts_insert_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_settings' AND policyname = 'sts_insert_own') THEN
  CREATE POLICY "sts_insert_own" ON store_theme_settings
    FOR INSERT WITH CHECK (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sts_insert_own$;

DO $pol_sts_update_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_settings' AND policyname = 'sts_update_own') THEN
  CREATE POLICY "sts_update_own" ON store_theme_settings
    FOR UPDATE USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_sts_update_own$;

-- store_theme_pages
ALTER TABLE store_theme_pages ENABLE ROW LEVEL SECURITY;

DO $pol_stp_select_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_pages' AND policyname = 'stp_select_own') THEN
  CREATE POLICY "stp_select_own" ON store_theme_pages
    FOR SELECT USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stp_select_own$;

DO $pol_stp_insert_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_pages' AND policyname = 'stp_insert_own') THEN
  CREATE POLICY "stp_insert_own" ON store_theme_pages
    FOR INSERT WITH CHECK (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stp_insert_own$;

DO $pol_stp_update_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_pages' AND policyname = 'stp_update_own') THEN
  CREATE POLICY "stp_update_own" ON store_theme_pages
    FOR UPDATE USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stp_update_own$;

-- store_theme_custom_files
ALTER TABLE store_theme_custom_files ENABLE ROW LEVEL SECURITY;

DO $pol_stcf_select_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_custom_files' AND policyname = 'stcf_select_own') THEN
  CREATE POLICY "stcf_select_own" ON store_theme_custom_files
    FOR SELECT USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stcf_select_own$;

DO $pol_stcf_insert_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_custom_files' AND policyname = 'stcf_insert_own') THEN
  CREATE POLICY "stcf_insert_own" ON store_theme_custom_files
    FOR INSERT WITH CHECK (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stcf_insert_own$;

DO $pol_stcf_update_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_custom_files' AND policyname = 'stcf_update_own') THEN
  CREATE POLICY "stcf_update_own" ON store_theme_custom_files
    FOR UPDATE USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stcf_update_own$;

DO $pol_stcf_delete_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'store_theme_custom_files' AND policyname = 'stcf_delete_own') THEN
  CREATE POLICY "stcf_delete_own" ON store_theme_custom_files
    FOR DELETE USING (
      install_id IN (
        SELECT sti.id FROM store_theme_installs sti
        JOIN creators c ON c.id = sti.creator_id
        WHERE c.user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_stcf_delete_own$;

-- theme_publish_history
ALTER TABLE theme_publish_history ENABLE ROW LEVEL SECURITY;

DO $pol_tph_select_own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'theme_publish_history' AND policyname = 'tph_select_own') THEN
  CREATE POLICY "tph_select_own" ON theme_publish_history
    FOR SELECT USING (
      creator_id IN (
        SELECT id FROM creators WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$pol_tph_select_own$;

-- ── 8. Seed: Built-in Themes ─────────────────────────────────

INSERT INTO themes (id, name, slug, description, author, version, is_built_in, is_free, price_cents, tags, category, preview_image_url)
VALUES
  (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Storelib Default',
    'storelib-default',
    'A clean, modern storefront theme designed to showcase your digital products beautifully. Perfect for creators getting started.',
    'Storelib',
    '1.0.0',
    true,
    true,
    0,
    ARRAY['minimal', 'clean', 'modern', 'default'],
    'general',
    NULL
  ),
  (
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'Creator Minimal',
    'creator-minimal',
    'A refined minimal theme for creators who let their work speak for itself. White space, sharp typography, focused layout.',
    'Storelib',
    '1.0.0',
    true,
    true,
    0,
    ARRAY['minimal', 'clean', 'creator', 'typography'],
    'minimal',
    NULL
  ),
  (
    'c3d4e5f6-a7b8-9012-cdef-123456789012',
    'Digital Wave',
    'digital-wave',
    'A bold, high-energy theme with gradient accents and dynamic section layouts. Built for digital creators who want to stand out.',
    'Storelib',
    '1.0.0',
    true,
    true,
    0,
    ARRAY['bold', 'gradient', 'vibrant', 'digital'],
    'bold',
    NULL
  )
ON CONFLICT (slug) DO NOTHING;

-- ── 9. Helper function: initialize themes for a new creator ──
-- Called during onboarding or on first visit to Website Builder.
CREATE OR REPLACE FUNCTION initialize_creator_themes(p_creator_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_theme_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_minimal_theme_id UUID := 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  v_wave_theme_id    UUID := 'c3d4e5f6-a7b8-9012-cdef-123456789012';
  v_install_id       UUID;
  v_already_initialized BOOLEAN;
BEGIN
  -- Check if already initialized
  SELECT EXISTS(
    SELECT 1 FROM store_theme_installs WHERE creator_id = p_creator_id
  ) INTO v_already_initialized;

  IF v_already_initialized THEN
    RETURN;
  END IF;

  -- Install Storelib Default as the live published theme
  INSERT INTO store_theme_installs (creator_id, theme_id, name, status, sort_order)
  VALUES (p_creator_id, v_default_theme_id, 'Storelib Default', 'published', 0)
  RETURNING id INTO v_install_id;

  -- Create default settings for the published theme
  INSERT INTO store_theme_settings (install_id, settings)
  VALUES (v_install_id, '{
    "brand_name": "My Store",
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "accent_color": "#f59e0b",
    "background_color": "#ffffff",
    "surface_color": "#f8fafc",
    "text_color": "#0f172a",
    "text_secondary_color": "#64748b",
    "border_color": "#e2e8f0",
    "font_heading": "Inter",
    "font_body": "Inter",
    "font_size_base": 16,
    "button_style": "rounded",
    "border_radius": 8,
    "page_width": 1280,
    "spacing_scale": 1.0,
    "announcement_bar_enabled": false,
    "announcement_bar_text": "Free shipping on orders over $50",
    "announcement_bar_bg": "#6366f1",
    "announcement_bar_color": "#ffffff"
  }');

  -- Create default home page with starter sections
  INSERT INTO store_theme_pages (install_id, page_key, sections)
  VALUES (v_install_id, 'home', '[
    {
      "id": "header-default",
      "type": "header",
      "name": "Header",
      "hidden": false,
      "settings": {
        "logo_text": "My Store",
        "cta_text": "Shop Now",
        "cta_url": "/products",
        "sticky": true,
        "bg_color": "#ffffff",
        "text_color": "#0f172a"
      },
      "blocks": []
    },
    {
      "id": "hero-default",
      "type": "hero",
      "name": "Hero",
      "hidden": false,
      "settings": {
        "heading": "Discover Amazing Digital Products",
        "subheading": "High-quality digital downloads, courses, and resources created just for you.",
        "cta_text": "Shop Now",
        "cta_url": "/products",
        "cta_style": "primary",
        "layout": "center",
        "full_height": false,
        "bg_color": "#0f172a",
        "text_color": "#ffffff",
        "overlay_opacity": 0
      },
      "blocks": []
    },
    {
      "id": "features-default",
      "type": "feature_grid",
      "name": "Features",
      "hidden": false,
      "settings": {
        "heading": "Why Choose Us",
        "columns": "3",
        "bg_color": "#f8fafc",
        "text_color": "#0f172a"
      },
      "blocks": [
        {"id": "feat-1", "type": "feature", "settings": {"icon": "zap", "title": "Instant Download", "description": "Get your files immediately after purchase, no waiting."}},
        {"id": "feat-2", "type": "feature", "settings": {"icon": "shield", "title": "Secure & Safe", "description": "All transactions are encrypted and your data is protected."}},
        {"id": "feat-3", "type": "feature", "settings": {"icon": "refresh-cw", "title": "Lifetime Access", "description": "Purchase once and access your content forever."}}
      ]
    },
    {
      "id": "products-default",
      "type": "product_list",
      "name": "Featured Products",
      "hidden": false,
      "settings": {
        "heading": "Featured Products",
        "subheading": "Our most popular digital products",
        "show_price": true,
        "show_button": true,
        "columns": "3",
        "bg_color": "#ffffff",
        "text_color": "#0f172a"
      },
      "blocks": []
    },
    {
      "id": "cta-default",
      "type": "cta",
      "name": "Call to Action",
      "hidden": false,
      "settings": {
        "heading": "Ready to Get Started?",
        "subheading": "Join thousands of creators who trust our platform.",
        "button_text": "Browse Products",
        "button_url": "/products",
        "bg_color": "#6366f1",
        "text_color": "#ffffff",
        "button_color": "#ffffff"
      },
      "blocks": []
    },
    {
      "id": "footer-default",
      "type": "footer",
      "name": "Footer",
      "hidden": false,
      "settings": {
        "logo_text": "My Store",
        "copyright": "© 2026 My Store. All rights reserved.",
        "bg_color": "#0f172a",
        "text_color": "#94a3b8"
      },
      "blocks": []
    }
  ]');

  -- Install Creator Minimal (unpublished, in library)
  INSERT INTO store_theme_installs (creator_id, theme_id, name, status, sort_order)
  VALUES (p_creator_id, v_minimal_theme_id, 'Creator Minimal', 'unpublished', 1)
  RETURNING id INTO v_install_id;

  INSERT INTO store_theme_settings (install_id, settings)
  VALUES (v_install_id, '{
    "brand_name": "My Store",
    "primary_color": "#171717",
    "secondary_color": "#404040",
    "accent_color": "#737373",
    "background_color": "#ffffff",
    "surface_color": "#fafafa",
    "text_color": "#171717",
    "text_secondary_color": "#737373",
    "border_color": "#e5e5e5",
    "font_heading": "Plus Jakarta Sans",
    "font_body": "Inter",
    "font_size_base": 16,
    "button_style": "square",
    "border_radius": 2,
    "page_width": 1100,
    "spacing_scale": 1.2
  }');

  INSERT INTO store_theme_pages (install_id, page_key, sections)
  VALUES (v_install_id, 'home', '[
    {
      "id": "header-minimal",
      "type": "header",
      "name": "Header",
      "hidden": false,
      "settings": {
        "logo_text": "Studio",
        "cta_text": "Work with me",
        "cta_url": "/contact",
        "sticky": false,
        "bg_color": "#ffffff",
        "text_color": "#171717"
      },
      "blocks": []
    },
    {
      "id": "hero-minimal",
      "type": "hero",
      "name": "Hero",
      "hidden": false,
      "settings": {
        "heading": "Work That Speaks.",
        "subheading": "Digital tools, templates and resources built for the modern creator.",
        "cta_text": "View work",
        "cta_url": "/products",
        "cta_style": "outline",
        "layout": "left",
        "full_height": false,
        "bg_color": "#fafafa",
        "text_color": "#171717",
        "overlay_opacity": 0
      },
      "blocks": []
    },
    {
      "id": "richtext-minimal",
      "type": "rich_text",
      "name": "About",
      "hidden": false,
      "settings": {
        "heading": "Crafted with intention",
        "body": "Every product is built with careful attention to detail, designed to help you move faster and create better work.",
        "alignment": "left",
        "bg_color": "#ffffff",
        "text_color": "#171717",
        "max_width": "narrow"
      },
      "blocks": []
    },
    {
      "id": "products-minimal",
      "type": "product_list",
      "name": "Products",
      "hidden": false,
      "settings": {
        "heading": "Products",
        "subheading": "",
        "show_price": true,
        "show_button": false,
        "columns": "2",
        "bg_color": "#fafafa",
        "text_color": "#171717"
      },
      "blocks": []
    },
    {
      "id": "testimonials-minimal",
      "type": "testimonials",
      "name": "Testimonials",
      "hidden": false,
      "settings": {
        "heading": "What people say",
        "bg_color": "#ffffff",
        "text_color": "#171717"
      },
      "blocks": [
        {"id": "t1", "type": "testimonial", "settings": {"quote": "Incredibly well crafted. Changed how I work completely.", "author": "Sarah K.", "role": "Designer"}},
        {"id": "t2", "type": "testimonial", "settings": {"quote": "The attention to detail is something else. Worth every penny.", "author": "James L.", "role": "Developer"}},
        {"id": "t3", "type": "testimonial", "settings": {"quote": "Simple, effective, exactly what I needed.", "author": "Mia T.", "role": "Freelancer"}}
      ]
    },
    {
      "id": "footer-minimal",
      "type": "footer",
      "name": "Footer",
      "hidden": false,
      "settings": {
        "logo_text": "Studio",
        "copyright": "© 2026",
        "bg_color": "#171717",
        "text_color": "#737373"
      },
      "blocks": []
    }
  ]');

  -- Install Digital Wave (unpublished, in library)
  INSERT INTO store_theme_installs (creator_id, theme_id, name, status, sort_order)
  VALUES (p_creator_id, v_wave_theme_id, 'Digital Wave', 'unpublished', 2)
  RETURNING id INTO v_install_id;

  INSERT INTO store_theme_settings (install_id, settings)
  VALUES (v_install_id, '{
    "brand_name": "My Store",
    "primary_color": "#7c3aed",
    "secondary_color": "#db2777",
    "accent_color": "#f59e0b",
    "background_color": "#0a0a0f",
    "surface_color": "#13131a",
    "text_color": "#f1f5f9",
    "text_secondary_color": "#94a3b8",
    "border_color": "#1e1e2e",
    "font_heading": "Space Grotesk",
    "font_body": "Inter",
    "font_size_base": 16,
    "button_style": "pill",
    "border_radius": 12,
    "page_width": 1280,
    "spacing_scale": 1.0
  }');

  INSERT INTO store_theme_pages (install_id, page_key, sections)
  VALUES (v_install_id, 'home', '[
    {
      "id": "header-wave",
      "type": "header",
      "name": "Header",
      "hidden": false,
      "settings": {
        "logo_text": "WAVE",
        "cta_text": "Get Started",
        "cta_url": "/products",
        "sticky": true,
        "bg_color": "#0a0a0f",
        "text_color": "#f1f5f9"
      },
      "blocks": []
    },
    {
      "id": "hero-wave",
      "type": "hero",
      "name": "Hero",
      "hidden": false,
      "settings": {
        "heading": "Create. Ship. Grow.",
        "subheading": "Premium digital products built for the next generation of creators.",
        "cta_text": "Start Creating",
        "cta_url": "/products",
        "cta_style": "primary",
        "layout": "center",
        "full_height": true,
        "bg_color": "#0a0a0f",
        "text_color": "#f1f5f9",
        "overlay_opacity": 0
      },
      "blocks": []
    },
    {
      "id": "stats-wave",
      "type": "stats",
      "name": "Stats",
      "hidden": false,
      "settings": {
        "bg_color": "#13131a",
        "text_color": "#f1f5f9"
      },
      "blocks": [
        {"id": "s1", "type": "stat", "settings": {"value": "10K+", "label": "Customers"}},
        {"id": "s2", "type": "stat", "settings": {"value": "50+", "label": "Products"}},
        {"id": "s3", "type": "stat", "settings": {"value": "4.9★", "label": "Rating"}},
        {"id": "s4", "type": "stat", "settings": {"value": "100%", "label": "Digital"}}
      ]
    },
    {
      "id": "products-wave",
      "type": "product_list",
      "name": "Products",
      "hidden": false,
      "settings": {
        "heading": "Hot Right Now",
        "subheading": "The products everyone is talking about",
        "show_price": true,
        "show_button": true,
        "columns": "3",
        "bg_color": "#0a0a0f",
        "text_color": "#f1f5f9"
      },
      "blocks": []
    },
    {
      "id": "cta-wave",
      "type": "cta",
      "name": "CTA",
      "hidden": false,
      "settings": {
        "heading": "Ready to ride the wave?",
        "subheading": "Join thousands of digital creators already growing with us.",
        "button_text": "Get Started Free",
        "button_url": "/products",
        "bg_color": "#7c3aed",
        "text_color": "#ffffff",
        "button_color": "#ffffff"
      },
      "blocks": []
    },
    {
      "id": "footer-wave",
      "type": "footer",
      "name": "Footer",
      "hidden": false,
      "settings": {
        "logo_text": "WAVE",
        "copyright": "© 2026 Digital Wave. All rights reserved.",
        "bg_color": "#07070b",
        "text_color": "#4a4a5a"
      },
      "blocks": []
    }
  ]');

END;
$$;

-- ── 10. updated_at triggers ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'themes_updated_at') THEN
    CREATE TRIGGER themes_updated_at
      BEFORE UPDATE ON themes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sti_updated_at') THEN
    CREATE TRIGGER sti_updated_at
      BEFORE UPDATE ON store_theme_installs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sts_updated_at') THEN
    CREATE TRIGGER sts_updated_at
      BEFORE UPDATE ON store_theme_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'stp_updated_at') THEN
    CREATE TRIGGER stp_updated_at
      BEFORE UPDATE ON store_theme_pages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'stcf_updated_at') THEN
    CREATE TRIGGER stcf_updated_at
      BEFORE UPDATE ON store_theme_custom_files
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

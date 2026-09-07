-- ###########################################################################
--  STORELIB — CREATOR PAGE, STORE BUILDER AND STORELIB AI
-- ###########################################################################
--  ONE file. Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  GENERATED, never hand-edited. Regenerate with
--
--      node scripts/build-creator-page-sql.mjs
--
--  IDEMPOTENT. Running it again changes nothing and raises nothing — every
--  statement guards itself. Verified by running the whole file three times in
--  a row against a real Postgres 16, not by reading it.
--
--  PREREQUISITE: public.creators, public.products, public.profiles and
--  public.custom_domains. Those are the base schema; this file does not
--  create them.
--
--  ORDER, and why:
--     1. Theme tables: installs, settings, pages
--     2. Public read for a published theme
--     3. Creator page configs — the schema this repo never had
--     4. Follows
--     5. Subscribe bar: sticky on by default
--     6. One published storefront per creator
--     7. Creator pages made before the recent changes
--     8. Storelib AI: sites, files, versions, deployments
--
-- ---------------------------------------------------------------------------
--  THE ONE THING THAT CAN STOP THIS FILE
-- ---------------------------------------------------------------------------
--  Section 8 refuses to run if site_versions, site_form_submissions or
--  site_integrations already exist in the OLD install_id shape AND contain
--  rows. Nothing ever wrote to them, so this should not happen; if it does,
--  the error names the table and the row count, nothing has been changed, and
--  a person should look before anything is dropped. That refusal is
--  deliberate — it is the alternative to a migration quietly destroying data
--  it does not understand.
-- ###########################################################################




-- ###########################################################################
--  SECTION  1: Theme tables: installs, settings, pages
--  source: supabase/migrations/20260317000000_website_builder.sql
-- ###########################################################################

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



-- ###########################################################################
--  SECTION  2: Public read for a published theme
--  source: supabase/migrations/20260407_website_builder_public_read_hardened.sql
-- ###########################################################################

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



-- ###########################################################################
--  SECTION  3: Creator page configs — the schema this repo never had
--  source: supabase/migrations/20260115_store_builder_configs_baseline.sql
-- ###########################################################################

-- ============================================================================
--  store_builder_configs / product_page_configs — the missing baseline
-- ============================================================================
--
--  WHY THIS FILE EXISTS, AND WHY ITS DATE IS EARLIER THAN THE DAY IT WAS
--  WRITTEN.
--
--  These two tables carry every creator page on the platform. About thirty
--  call sites read and write them. And until now NOTHING IN THIS REPOSITORY
--  CREATED THEM: they were made by hand in the Supabase dashboard, and the
--  migrations directory only ever contained changes layered on top —
--  20260225_performance_indexes adds an index to a table it never defines,
--  20260906 and 20260909 back-fill rows in a table they assume.
--
--  So the migrations ran fine against the one database that happened to have
--  been set up by hand, and failed on the first line against any other with
--
--      ERROR: relation "public.store_builder_configs" does not exist
--
--  The date is 20260115 because that is where this belongs in dependency
--  order — before 20260116_store_builder_images_bucket, and well before
--  anything that indexes or back-fills these tables. Ordering here is a
--  contract, not a changelog.
--
--  The shape below is reconstructed from the code that uses it:
--  app/api/store-builder/route.ts, lib/store-builder/*, and the marketing
--  routes that read published_config.
--
--  SAFE ON THE LIVE DATABASE. Every statement is IF NOT EXISTS, and the
--  security block at the end runs ONLY when this migration is the thing that
--  created the table — see the note there, which is the important one.
-- ============================================================================

-- ── the tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_builder_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- 'shop' is the creator page; 'product' is the default product template.
  page_type        TEXT NOT NULL,
  -- What the builder is editing.
  draft_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- What the public page renders. Never written except by Publish.
  published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_updated_at TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-product overrides of the product template.
CREATE TABLE IF NOT EXISTS public.product_page_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  draft_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_updated_at TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A database older than one of these columns gets it now rather than a
-- 42703 at runtime. Adding a nullable column is not a rewrite.
ALTER TABLE public.store_builder_configs
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.product_page_configs
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── one row per (creator, page) ─────────────────────────────────────────────
--
--  The code says `.eq(creator_id).eq(page_type).single()`. `single()` is an
--  ERROR on two rows, not a pick — a duplicate does not degrade the page, it
--  takes it down. So the uniqueness belongs in the database.
--
--  BUT: creating a unique index on a table that already holds duplicates
--  fails, and this migration must not be the thing that stops a live
--  deployment. So it is created only when the data already satisfies it, and
--  the duplicates are reported rather than resolved — deciding which of two
--  configs is the real one is a judgement call, not a migration.
DO $baseline_unique$
DECLARE
  dupes INTEGER;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.store_builder_configs
    GROUP BY creator_id, page_type HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING
      'store_builder_configs: % (creator_id, page_type) pair(s) have duplicate rows; unique index not created. Resolve them, then re-run this migration.',
      dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_sbc_creator_page
      ON public.store_builder_configs (creator_id, page_type);
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.product_page_configs
    GROUP BY creator_id, product_id HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING
      'product_page_configs: % (creator_id, product_id) pair(s) have duplicate rows; unique index not created.',
      dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_ppc_creator_product
      ON public.product_page_configs (creator_id, product_id);
  END IF;
END;
$baseline_unique$;

CREATE INDEX IF NOT EXISTS idx_ppc_product ON public.product_page_configs (product_id);

-- ── security, and only on a database that did not already have these ────────
--
--  THIS IS THE PART THAT COULD BREAK A LIVE SITE, so it is fenced.
--
--  The production database configured RLS on these tables by hand, months
--  ago, and this file cannot see what those policies say. Running
--  ENABLE ROW LEVEL SECURITY against a table whose policies do not match
--  would take every creator page on the platform offline in one statement.
--
--  So: if the table already existed when this migration started, its
--  security configuration is left exactly as it is. What is set up below is
--  for a NEW environment — a fresh Supabase project, a staging clone, a
--  local stack — where there is nothing to break and no policy to guess at.
--
--  KNOWN GAP, stated rather than hidden: the public SELECT policy is
--  row-level, so a visitor who queries the table directly can also see
--  `draft_config` — a creator's unpublished layout. That matches how the app
--  reads today (the public routes select `published_config` by name, but RLS
--  cannot enforce that). Closing it properly means a published-only view and
--  a change at the read sites, which is a code change, not a baseline.
DO $baseline_rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['store_builder_configs', 'product_page_configs']
  LOOP
    -- No policies at all is the signal that this migration created the
    -- table. A hand-configured production table has policies already.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
        WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
    $p$, t || '_own', t);

    -- Anyone on the internet can read a creator page.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR SELECT TO anon, authenticated
        USING (published_config IS NOT NULL AND published_config <> '{}'::jsonb)
    $p$, t || '_public_read', t);

    -- RLS sits on top of GRANTs; without this the policy never gets asked.
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END;
$baseline_rls$;

-- ── updated_at ──────────────────────────────────────────────────────────────
--
--  Only if the shared trigger function exists. It is created by an earlier
--  hand-made object in production; a new environment that lacks it should
--  not fail here, because the app writes updated_at explicitly anyway.
DO $baseline_touch$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    RAISE NOTICE 'update_updated_at_column() not present; skipping updated_at triggers.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['store_builder_configs', 'product_page_configs']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_updated_at') THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t || '_updated_at', t);
    END IF;
  END LOOP;
END;
$baseline_touch$;



-- ###########################################################################
--  SECTION  4: Follows
--  source: supabase/migrations/20260731_follows.sql
-- ###########################################################################

-- ============================================================================
-- storelib — the follow graph
--
-- Backs the Following tab in the mobile feed and the Follow control on each
-- listing. Safe to run more than once.
--
-- A follow points at a PROFILE (which is an auth user), not at a creator row.
-- Sellers are reached through creators, but a person is the thing you follow —
-- that way the People results in search can use exactly the same button, and a
-- seller who later gains or changes a creator row keeps their followers.
-- ============================================================================

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Following yourself is never meaningful and would pollute follower counts.
  constraint follows_no_self check (follower_id <> following_id),
  -- Makes a follow idempotent: the API can upsert without racing itself when a
  -- button is double-tapped.
  constraint follows_unique unique (follower_id, following_id)
);

-- "Who do I follow" (the Following feed, and hydrating button state).
create index if not exists idx_follows_follower_id on public.follows (follower_id);
-- "How many follow them" (follower counts on a profile).
create index if not exists idx_follows_following_id on public.follows (following_id);

alter table public.follows enable row level security;

-- The graph is public, the same way follower counts are public on any
-- marketplace: anyone may read it, but you may only ever add or remove your own
-- follows. follower_id is never taken from the request body.
drop policy if exists "follows are readable by everyone" on public.follows;
create policy "follows are readable by everyone"
  on public.follows for select
  using (true);

drop policy if exists "users insert their own follows" on public.follows;
create policy "users insert their own follows"
  on public.follows for insert
  with check (auth.uid() = follower_id);

drop policy if exists "users delete their own follows" on public.follows;
create policy "users delete their own follows"
  on public.follows for delete
  using (auth.uid() = follower_id);



-- ###########################################################################
--  SECTION  5: Subscribe bar: sticky on by default
--  source: supabase/migrations/20260906_subscribe_bar_sticky_default.sql
-- ###########################################################################

-- ============================================================================
--  Subscribe bar: sticky on by default, and the bar always visible
-- ============================================================================
--
--  WHAT THIS FIXES
--
--  The store builder wrote the whole subscribe-bar settings object out on
--  every save, whether or not the creator ever touched the sticky switch —
--  and that switch defaulted to OFF for as long as it existed. So nearly
--  every stored config on the platform carries an explicit
--
--      "enableStickyBar": false
--
--  that never represented anybody's decision. Application-side defaults
--  cannot see past it (`false ?? true` is `false`), which is why changing the
--  fallback in code fixed nothing on live pages.
--
--  The code now distinguishes the two cases with a `stickyBarChoiceMade`
--  flag: absent means "no one has chosen, use the platform default", present
--  means "this creator decided, honour the stored value exactly, including
--  off". This migration backfills the flag so the stored data agrees with
--  what the app already renders:
--
--    - configs with no flag get sticky ON and the flag set, and
--    - the `visible` key is forced true, because the "Show Subscribe Bar"
--      toggle has been removed from the builder and the bar always renders.
--
--  Creators who genuinely want it off can turn it off in the builder after
--  this runs; that writes `stickyBarChoiceMade: true` alongside their `false`
--  and is honoured from then on.
--
--  IDEMPOTENT: the WHERE clause skips rows that already carry the flag, so
--  re-running this will not overwrite a creator's later choice.
-- ============================================================================

-- Draft configs
update public.store_builder_configs
set draft_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          draft_config,
          '{headerSettings,subscribeBar,enableStickyBar}', 'true'::jsonb, true
        ),
        '{headerSettings,subscribeBar,enableStickyOnScrollUp}', 'true'::jsonb, true
      ),
      '{headerSettings,subscribeBar,stickyBarChoiceMade}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and draft_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (draft_config -> 'headerSettings' -> 'subscribeBar' ->> 'stickyBarChoiceMade')::boolean,
        false
      ) = false;

-- Published configs (what the public storefront actually reads)
update public.store_builder_configs
set published_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          published_config,
          '{headerSettings,subscribeBar,enableStickyBar}', 'true'::jsonb, true
        ),
        '{headerSettings,subscribeBar,enableStickyOnScrollUp}', 'true'::jsonb, true
      ),
      '{headerSettings,subscribeBar,stickyBarChoiceMade}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and published_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (published_config -> 'headerSettings' -> 'subscribeBar' ->> 'stickyBarChoiceMade')::boolean,
        false
      ) = false;

-- The bar is no longer optional — clear any stored `visible: false`.
update public.store_builder_configs
set draft_config = jsonb_set(
      draft_config, '{headerSettings,subscribeBar,visible}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and draft_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (draft_config -> 'headerSettings' -> 'subscribeBar' ->> 'visible')::boolean,
        true
      ) = false;

update public.store_builder_configs
set published_config = jsonb_set(
      published_config, '{headerSettings,subscribeBar,visible}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and published_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (published_config -> 'headerSettings' -> 'subscribeBar' ->> 'visible')::boolean,
        true
      ) = false;



-- ###########################################################################
--  SECTION  6: One published storefront per creator
--  source: supabase/migrations/20260908_storelib_sites.sql
-- ###########################################################################

-- ============================================================
-- Storelib Sites — Phase 1 foundation
-- ============================================================
--
-- Sites is the website builder, opened up. It is NOT a second
-- system: the section schemas, the 51 renderers, the registry,
-- the theme settings and the draft/published split all stay
-- exactly where they are. See docs/storelib-sites.md.
--
-- This migration is ADDITIVE ONLY — no renames, no drops, no
-- changed defaults on existing columns. Three live surfaces read
-- these tables today (the /w/{username} public route, the
-- storefront at /[sellername], and the editor), and every one of
-- them must keep working unchanged after this runs.
--
-- The safety mechanism is `kind`. Every row that exists today
-- becomes kind='storefront' and behaves as it always has; Sites
-- creates kind='site' rows. Anywhere the two must differ, the
-- difference is expressed as a filter on `kind` rather than as a
-- change to shared behaviour.
-- ============================================================

-- ── 1. A site is an entity, not just "the creator's theme" ───
--
-- store_theme_installs is already 90% of what a site row needs:
-- name, status, is_custom, parent_install_id, sort_order. What it
-- lacks is an identity of its own — somewhere to live, and its
-- own settings.
ALTER TABLE store_theme_installs
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'storefront',
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_theme_installs_kind_check'
  ) THEN
    ALTER TABLE store_theme_installs
      ADD CONSTRAINT store_theme_installs_kind_check
      CHECK (kind IN ('storefront', 'site'));
  END IF;
END;
$$;

-- {slug}.storelib.site. Null for storefronts, which live at
-- /w/{username} and have no slug of their own.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sti_slug
  ON store_theme_installs (lower(slug)) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sti_kind ON store_theme_installs (kind);

-- ── 2. One published STOREFRONT per creator — not one site ───
--
-- `uniq_sti_creator_published` enforces a single published install
-- per creator, which is right for a storefront and wrong for
-- Sites: a creator on a paid plan may publish several. Narrowing
-- the index to storefronts keeps the old guarantee exactly where
-- it applied and lifts it where it never should have.
DROP INDEX IF EXISTS uniq_sti_creator_published;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sti_creator_published_storefront
  ON store_theme_installs (creator_id)
  WHERE status = 'published' AND kind = 'storefront';

-- ── 3. Pages become pages ────────────────────────────────────
--
-- store_theme_pages already stores one row per page keyed by
-- `page_key`, and the sections API already accepts any key — so
-- multi-page storage exists today. What is missing is everything
-- a page needs to be visitable and findable: a human title, SEO,
-- an order, and which one is the front door.
--
-- `page_key` keeps its meaning and becomes the URL slug. It is
-- already UNIQUE(install_id, page_key), which is exactly the
-- constraint a slug needs.
ALTER TABLE store_theme_pages
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS seo JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_homepage BOOLEAN NOT NULL DEFAULT false;

-- Every existing page_key='home' is its install's homepage. Said
-- explicitly rather than inferred from the string, so the two
-- public routes can stop hardcoding "home".
UPDATE store_theme_pages SET is_homepage = true WHERE page_key = 'home' AND is_homepage = false;
UPDATE store_theme_pages SET title = 'Home' WHERE page_key = 'home' AND title IS NULL;

-- At most one homepage per install.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stp_install_homepage
  ON store_theme_pages (install_id) WHERE is_homepage;



-- ── 4-6. REMOVED: site_versions, site_form_submissions,
--         site_integrations ─────────────────────────────────────
--
-- These three were designed for the section-JSON architecture this
-- migration was written under, and they keyed off `install_id`.
-- 20260910_sites_projects creates tables with the SAME THREE NAMES
-- keyed off `site_id`, because a site is now a project of files and
-- not a theme install (docs/storelib-sites.md §8).
--
-- CREATE TABLE IF NOT EXISTS does not reconcile a shape — it skips.
-- So on any database that ran this file first, 20260910 silently got
-- the wrong three tables and then failed outright building an index
-- on a `site_id` column that was never there. Nothing ever read these,
-- so they are gone from here rather than renamed, and 20260910 cleans
-- up after a database that already created them.

-- ── 7. Template purchases ────────────────────────────────────
--
-- `themes` already carries is_free/price_cents/author, so the
-- marketplace catalogue exists. This is the record of who owns
-- what — the thing "Use template" checks before copying a paid
-- template into somebody's account.
CREATE TABLE IF NOT EXISTS site_template_purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id     UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  buyer_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_cents  INTEGER NOT NULL DEFAULT 0,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (theme_id, buyer_id)
);

-- ── 8. Domains point at a site ───────────────────────────────
--
-- custom_domains already has DNS verification, SSL status and
-- resolution wired into proxy.ts. It is creator-scoped, so it
-- cannot say WHICH of a creator's sites a domain serves. One
-- nullable column, and a null keeps today's meaning: the
-- creator's storefront.
ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS install_id UUID REFERENCES store_theme_installs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_custom_domains_install ON custom_domains (install_id);

-- ── 9. RLS ───────────────────────────────────────────────────
--
-- Only site_template_purchases is created here now, so only it
-- needs a policy. A buyer reads their own purchases; writes are
-- server-side only, after payment — there is no client-side
-- insert policy, and that omission is the point.
ALTER TABLE site_template_purchases ENABLE ROW LEVEL SECURITY;
--
-- The same shape every store_theme_* table already uses: reach
-- the row through its install, the install through creators, and
-- creators through auth.uid(). Nothing here is publicly readable
-- — published sites are served by the admin client through a
-- route that filters to status='published', exactly as
-- /w/{username} already does.

-- A buyer reads their own purchases. Writes are server-side only,
-- after payment — there is no client-side insert policy, and that
-- omission is the point.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_template_purchases' AND policyname = 'stpur_select_own') THEN
    CREATE POLICY stpur_select_own ON site_template_purchases
      FOR SELECT USING (buyer_id = auth.uid());
  END IF;
END;
$$;



-- ###########################################################################
--  SECTION  7: Creator pages made before the recent changes
--  source: supabase/migrations/20260909_creator_page_backfill.sql
-- ###########################################################################

-- ============================================================
-- Creator pages made before the recent changes
-- ============================================================
--
-- Most of what changed on the creator page this week was rendering,
-- and rendering needs no migration: the shared catalog header, the
-- tab strip, the optimized cover and avatar, the Simple Icons marks,
-- the "Featured" headline and the rail's horizontal padding are all
-- decided at render time from settings that already exist.
--
-- THREE THINGS ARE NOT. Each is a stored value that predates a
-- feature, so the page has no way to infer what the creator wanted.
--
-- Written to be safe to run twice, and to touch only what is
-- genuinely stale — a creator who has already made a choice keeps it.
-- ============================================================

-- ── 1. The About section, for configs that have none ─────────
--
-- The About block renders at the foot of every tab. A config saved
-- before that section existed simply has no `about` entry in its
-- sections array, so those pages end at the product grid — no story,
-- no joined date, no payment methods, and no way to add one from the
-- page because the editor attaches to a section that isn't there.
--
-- Appended rather than inserted at an index: About is rendered last
-- regardless of its `order`, and rewriting other sections' order is
-- how a creator's arrangement gets quietly changed.
DO $$
DECLARE
  r RECORD;
  about_default JSONB := jsonb_build_object(
    'id', 'about-backfill',
    'type', 'about',
    'order', 999,
    'settings', jsonb_build_object(
      'visible', true,
      'sellerName', '',
      'headline', '',
      'aboutContent', '',
      'mediaItems', '[]'::jsonb,
      'showSalesStats', true,
      'showProductsStats', true,
      'showPaymentMethods', true,
      'paymentMethods', '["paypal","visa","mastercard","amex","applepay","googlepay"]'::jsonb,
      'maxContentHeight', 150,
      'spacing', jsonb_build_object('paddingTop', 48, 'paddingBottom', 48, 'paddingLeft', 0, 'paddingRight', 0),
      'mobileSpacing', jsonb_build_object('paddingTop', 24, 'paddingBottom', 24, 'paddingLeft', 0, 'paddingRight', 0),
      'colors', jsonb_build_object('backgroundColor', 'transparent', 'textColor', '', 'accentColor', '')
    )
  );
BEGIN
  FOR r IN
    SELECT id, draft_config, published_config
    FROM store_builder_configs
    WHERE page_type = 'shop'
  LOOP
    -- draft
    IF jsonb_typeof(r.draft_config -> 'sections') = 'array'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(r.draft_config->'sections') s
         WHERE s->>'type' = 'about'
       )
    THEN
      UPDATE store_builder_configs
      SET draft_config = jsonb_set(
            r.draft_config, '{sections}',
            (r.draft_config->'sections') || jsonb_build_array(about_default))
      WHERE id = r.id;
    END IF;

    -- published
    IF jsonb_typeof(r.published_config -> 'sections') = 'array'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(r.published_config->'sections') s
         WHERE s->>'type' = 'about'
       )
    THEN
      UPDATE store_builder_configs
      SET published_config = jsonb_set(
            r.published_config, '{sections}',
            (r.published_config->'sections') || jsonb_build_array(about_default))
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Video media items get their real label ────────────────
--
-- The filter is a jsonb test and NOT `config::text LIKE '%"type":"youtube"%'`,
-- which is what this originally said and which MATCHED NOTHING, EVER:
-- Postgres renders jsonb back to text with a space after every colon, so
-- the stored form is `"type": "youtube"` and the pattern never hit. The
-- whole section was a no-op on every database it had ever run against.
--
-- COALESCE around the outer jsonb_agg is not decoration. `jsonb_agg` over an
-- empty set returns NULL, and `jsonb_set(config, '{sections}', NULL)` returns
-- NULL for the WHOLE COLUMN — a config wiped rather than updated. The WHERE
-- clause makes that unreachable today, since a config containing
-- "type":"youtube" necessarily has a section; but the guard costs nothing and
-- the failure it prevents is a creator's page disappearing.
--
-- `type: "youtube"` used to mean "a video", and now that Vimeo works
-- the honest label is "video". The renderer reads both — nothing
-- branches on which — so this is cosmetic, and it is here so the two
-- stop accumulating side by side forever.
--
-- The URL is untouched. Normalising a stored link is a separate
-- decision and this migration is not the place to guess at one.
UPDATE store_builder_configs
SET draft_config = jsonb_set(
      draft_config, '{sections}',
      (SELECT COALESCE(jsonb_agg(
         CASE WHEN s->>'type' = 'about'
           THEN jsonb_set(s, '{settings,mediaItems}', (
             SELECT COALESCE(jsonb_agg(
               CASE WHEN m->>'type' = 'youtube' THEN jsonb_set(m, '{type}', '"video"') ELSE m END
             ), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(s->'settings'->'mediaItems', '[]'::jsonb)) m
           ))
           ELSE s END), '[]'::jsonb)
       FROM jsonb_array_elements(draft_config -> 'sections') s))
WHERE page_type = 'shop'
  AND jsonb_typeof(draft_config -> 'sections') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(draft_config -> 'sections') s,
         jsonb_array_elements(COALESCE(s -> 'settings' -> 'mediaItems', '[]'::jsonb)) m
    WHERE m ->> 'type' = 'youtube'
  );

UPDATE store_builder_configs
SET published_config = jsonb_set(
      published_config, '{sections}',
      (SELECT COALESCE(jsonb_agg(
         CASE WHEN s->>'type' = 'about'
           THEN jsonb_set(s, '{settings,mediaItems}', (
             SELECT COALESCE(jsonb_agg(
               CASE WHEN m->>'type' = 'youtube' THEN jsonb_set(m, '{type}', '"video"') ELSE m END
             ), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(s->'settings'->'mediaItems', '[]'::jsonb)) m
           ))
           ELSE s END), '[]'::jsonb)
       FROM jsonb_array_elements(published_config -> 'sections') s))
WHERE page_type = 'shop'
  AND jsonb_typeof(published_config -> 'sections') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(published_config -> 'sections') s,
         jsonb_array_elements(COALESCE(s -> 'settings' -> 'mediaItems', '[]'::jsonb)) m
    WHERE m ->> 'type' = 'youtube'
  );

-- ── 3. The social platforms added later ──────────────────────
--
-- Facebook, LinkedIn and Twitch are offered in the editor now. A
-- config saved before them has no key for them at all, and the
-- editor reads `socialLinks[key]?.url` — which is fine, but the
-- store builder's own panel writes the whole object back on save, so
-- the first save from an old config would drop them again.
--
-- Empty entries, so nothing appears on any page: an empty url is
-- what hides a social icon, and that rule is unchanged.
UPDATE store_builder_configs
SET draft_config = jsonb_set(
      draft_config, '{headerSettings,socialLinks}',
      COALESCE(draft_config->'headerSettings'->'socialLinks', '{}'::jsonb)
      || jsonb_build_object(
           'facebook', COALESCE(draft_config->'headerSettings'->'socialLinks'->'facebook', jsonb_build_object('enabled', false, 'url', '')),
           'linkedin', COALESCE(draft_config->'headerSettings'->'socialLinks'->'linkedin', jsonb_build_object('enabled', false, 'url', '')),
           'twitch',   COALESCE(draft_config->'headerSettings'->'socialLinks'->'twitch',   jsonb_build_object('enabled', false, 'url', ''))
         ))
WHERE page_type = 'shop' AND draft_config ? 'headerSettings';

UPDATE store_builder_configs
SET published_config = jsonb_set(
      published_config, '{headerSettings,socialLinks}',
      COALESCE(published_config->'headerSettings'->'socialLinks', '{}'::jsonb)
      || jsonb_build_object(
           'facebook', COALESCE(published_config->'headerSettings'->'socialLinks'->'facebook', jsonb_build_object('enabled', false, 'url', '')),
           'linkedin', COALESCE(published_config->'headerSettings'->'socialLinks'->'linkedin', jsonb_build_object('enabled', false, 'url', '')),
           'twitch',   COALESCE(published_config->'headerSettings'->'socialLinks'->'twitch',   jsonb_build_object('enabled', false, 'url', ''))
         ))
WHERE page_type = 'shop' AND published_config ? 'headerSettings';

-- ── Not done on purpose ──────────────────────────────────────
--
-- `headline: "Featured Products"` is NOT rewritten to "Featured".
-- The rail already prefers the creator's own headline and treats
-- only the old shipped default as unchosen, at render time — which
-- means a creator who deliberately typed "Featured Products" keeps
-- it. Rewriting the column would take that choice away from them
-- permanently, and there is no way to tell the two apart afterwards.
--
-- The featured section's `paddingLeft: 16` is NOT zeroed either. The
-- renderer ignores horizontal padding on that section now, so the
-- stored value is inert — and if a future layout wants it back, the
-- creator's number is still there.



-- ###########################################################################
--  SECTION  8: Storelib AI: sites, files, versions, deployments
--  source: supabase/migrations/20260910_sites_projects.sql
-- ###########################################################################

-- ============================================================
-- Storelib Sites — code projects
-- ============================================================
--
-- Files are the source of truth. There is no section JSON in this
-- feature; see docs/storelib-sites.md.
--
-- This does NOT extend store_theme_installs. The previous design put
-- Sites there and it was the wrong home the moment the source of
-- truth became a file tree: that table's whole shape — one theme,
-- one settings blob, pages keyed by a string — describes a rendered
-- configuration, not a project. Those columns stay where they are,
-- unused and harmless; dropping them would be a destructive
-- migration for no gain.
--
-- Everything below is tenant-scoped through
-- sites.creator_id → creators.user_id = auth.uid(), which is the
-- shape every store_theme_* table already uses.
-- ============================================================

-- ── First: clean up after the previous design ────────────────
--
-- An earlier version of 20260908_storelib_sites created
-- site_versions, site_form_submissions and site_integrations keyed
-- off `install_id`, for the section-JSON architecture that this
-- feature replaced. The three names below are the same. CREATE
-- TABLE IF NOT EXISTS would skip them, leaving a database with the
-- wrong three tables and every Storelib AI write failing on a
-- missing `site_id`.
--
-- Dropping is guarded three ways, because a DROP TABLE in a
-- migration deserves to be: the table must have `install_id`, must
-- NOT already have `site_id`, and must be EMPTY. Nothing ever wrote
-- to them — no code path existed — so empty is the expected state,
-- and a row means something happened that this migration has no
-- business guessing about. In that case it leaves the table alone
-- and raises, so a human looks.
DO $reconcile$
DECLARE
  t TEXT;
  n BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_versions', 'site_form_submissions', 'site_integrations']
  LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'install_id'
    );

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'site_id'
    );

    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION
        'public.% has the old install_id shape and % row(s) in it. Storelib AI needs a site_id-keyed table of the same name. Move or delete those rows, then re-run this migration.',
        t, n;
    END IF;

    EXECUTE format('DROP TABLE public.%I', t);
    RAISE NOTICE 'Dropped empty legacy table public.% (install_id shape).', t;
  END LOOP;
END;
$reconcile$;

-- ── sites ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- {slug}.storelib.site — DNS-legal, checked by lib/sites/slug.ts
  slug          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'unpublished')),
  -- Which starter it began as. Kept for support and analytics; a site
  -- is its files, so this is history, not a live dependency.
  template_id   TEXT,
  settings      JSONB NOT NULL DEFAULT '{}',
  published_deployment_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_creator ON sites (creator_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sites_slug ON sites (lower(slug)) WHERE slug IS NOT NULL;

-- ── site_files ───────────────────────────────────────────────
--
-- One row per text file. A project is a few dozen small files and
-- the agent's entire vocabulary is per-path reads and writes, so
-- read_file and write_file are single-row operations rather than
-- fetch-blob / mutate / write-blob — which is also what makes two
-- concurrent edits merge instead of clobbering each other.
--
-- BINARY DOES NOT GO HERE. Images are Storage objects with a row in
-- site_assets; a base64 column would put megabytes into every
-- project read.
CREATE TABLE IF NOT EXISTS site_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, path)
);

CREATE INDEX IF NOT EXISTS idx_site_files_site ON site_files (site_id);

-- ── site_versions ────────────────────────────────────────────
--
-- A whole-project snapshot. Taken BEFORE every agent run, not after:
-- the point is recovering from an edit that broke the design, and a
-- snapshot taken afterwards has already lost the thing you wanted
-- back.
CREATE TABLE IF NOT EXISTS site_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  snapshot   JSONB NOT NULL,
  label      TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_versions_site ON site_versions (site_id, created_at DESC);

-- ── site_deployments ─────────────────────────────────────────
--
-- One row per publish. `output_path` is a Storage prefix holding the
-- built static files; a visitor is served from there and never from
-- a running process.
--
-- `error` is TEXT and is shown to developers under "Details" only —
-- a build failure must not put a stack trace in front of somebody who
-- asked for a website.
CREATE TABLE IF NOT EXISTS site_deployments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_id  UUID REFERENCES site_versions(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'building', 'ready', 'failed')),
  output_path TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_site_deployments_site ON site_deployments (site_id, created_at DESC);

-- ── site_assets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime        TEXT,
  bytes       BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, path)
);

-- ── site_integrations ────────────────────────────────────────
--
-- `config` is what the page may see. A Shopify Storefront token is
-- not that: `secret_ref` names a server-side secret and the token
-- never lands in this column, never reaches the client, and never
-- appears in a published bundle.
CREATE TABLE IF NOT EXISTS site_integrations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}',
  secret_ref TEXT,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, provider)
);

-- ── forms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_forms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  fields     JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_form_submissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id    UUID REFERENCES site_forms(id) ON DELETE CASCADE,
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fields     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sfs_site ON site_form_submissions (site_id, created_at DESC);

-- ── collections: why the AI never writes SQL ─────────────────
--
-- "Create a real estate site where I can add properties" becomes a
-- collection with a JSONB schema and rows of items — not CREATE
-- TABLE. The agent gets create_collection and add_collection_field;
-- it does not get a database connection, and there is no path by
-- which a generated prompt can reach DDL.
CREATE TABLE IF NOT EXISTS site_collections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  schema     JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS site_collection_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES site_collections(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sci_collection ON site_collection_items (collection_id, sort_order);

-- ── domains point at a site ──────────────────────────────────
--
-- custom_domains already has DNS verification, SSL status and
-- resolution wired into proxy.ts. A second domain system would be a
-- second set of DNS instructions to keep correct.
ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_custom_domains_site ON custom_domains (site_id);

-- ── RLS ──────────────────────────────────────────────────────
--
-- Same shape throughout: reach the row through its site, the site
-- through creators, creators through auth.uid(). Published sites are
-- served by a route using the admin client and filtering to
-- status='published' — nothing here is publicly readable, because a
-- public read on site_files is a way to read everyone's drafts and
-- their unreleased work.
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sites' AND policyname = 'sites_own') THEN
    CREATE POLICY sites_own ON sites USING (
      creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
    ) WITH CHECK (
      creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
    );
  END IF;
END;
$$;

DO $$
DECLARE
  t TEXT;
  owned TEXT := '
    site_id IN (
      SELECT s.id FROM sites s
      JOIN creators c ON c.id = s.creator_id
      WHERE c.user_id = auth.uid()
    )';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'site_files', 'site_versions', 'site_deployments', 'site_assets',
    'site_integrations', 'site_forms', 'site_form_submissions',
    'site_collections', 'site_collection_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_own') THEN
      EXECUTE format('CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)', t || '_own', t, owned, owned);
    END IF;
  END LOOP;
END;
$$;

-- ── updated_at ───────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sites', 'site_files', 'site_integrations']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_updated_at') THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t || '_updated_at', t);
    END IF;
  END LOOP;
END;
$$;



-- ###########################################################################
--  DONE — the check. Every column should read true.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.store_builder_configs')  is not null as creator_page_configs,
  to_regclass('public.product_page_configs')   is not null as product_page_configs,
  to_regclass('public.store_theme_installs')   is not null as theme_installs,
  to_regclass('public.follows')                is not null as follows,
  to_regclass('public.sites')                  is not null as storelib_ai_sites,
  to_regclass('public.site_files')             is not null as storelib_ai_files,
  exists (select 1 from pg_indexes where schemaname='public'
           and indexname='uniq_sti_creator_published_storefront') as one_published_storefront,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_versions'
             and column_name='site_id')                          as site_versions_reconciled,
  not exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_versions'
             and column_name='install_id')                       as legacy_shape_gone;

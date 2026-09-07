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


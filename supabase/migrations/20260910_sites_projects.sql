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
-- Guarded for the same reason as the install_id link above: this runs
-- inside the paste-once aggregate, and one error there aborts every
-- section after it — which is how a publishing schema goes missing.
DO $custom_domains_site$
BEGIN
  IF to_regclass('public.custom_domains') IS NULL THEN
    RAISE NOTICE 'custom_domains not present; skipping the site_id link';
    RETURN;
  END IF;
  ALTER TABLE custom_domains
    ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_custom_domains_site ON custom_domains (site_id);
END;
$custom_domains_site$;

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
--
-- DEFINED HERE, not assumed. The trigger below calls
-- update_updated_at_column(), which is created by 20260127 — a marketplace
-- migration that is in NEITHER paste-me file. On a database that has not run
-- it, the CREATE TRIGGER fails, and because the Supabase SQL editor stops at
-- the first error, everything after this point never runs: the agent ledger,
-- the publishing schema, the storage bucket. Publishing then fails with no
-- clue as to why, which is precisely the bug this file was fixing.
--
-- CREATE OR REPLACE is safe when it already exists: same name, same body,
-- and the marketplace's own triggers keep working because the definition
-- below is character-for-character what they already call.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $update_updated_at$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$update_updated_at$ language 'plpgsql';

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

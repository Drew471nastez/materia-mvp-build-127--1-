-- ###########################################################################
--  STORELIB AI — SITES, THE AGENT LEDGER, AND PUBLISHING
-- ###########################################################################
--  Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  This is the part that makes the Publish button work. If publishing says
--  "Publishing is not set up on this deployment yet", this is the file.
--
--  GENERATED, never hand-edited. Regenerate with
--
--      node scripts/build-creator-page-sql.mjs
--
--  IDEMPOTENT. Run it as many times as you like — every statement guards
--  itself, and running it on a database that already has all of this changes
--  nothing. Verified by running it twice in a row on a real Postgres 16.
--
--  PREREQUISITE: public.creators must exist. Nothing else is required —
--  custom_domains is linked only if it happens to be there.
--
--  WHAT IT CREATES:
--    1. Storelib AI: sites, files, versions, deployments
--    2. Storelib AI: what the agent did, and what it cost
--    3. Publishing, chat history, and one writer per site
--    4. The lookup every visitor pays for
--    5. A run outlives the connection that started it
--    6. The cover on a site card
--    7. What the project IS, remembered between runs
--
--  It is safe to run this even if you have already run
--  RUN_CREATOR_PAGE_AND_SITES.sql. They share these three sections.
-- ###########################################################################




-- ###########################################################################
--  SECTION 1: Storelib AI: sites, files, versions, deployments
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



-- ###########################################################################
--  SECTION 2: Storelib AI: what the agent did, and what it cost
--  source: supabase/migrations/20260911_site_agent_runs.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — what the agent did, and what it cost
-- ============================================================
--
-- One row per agent run. Three jobs, and each is the reason a
-- column exists rather than a nice-to-have:
--
--  1. THE MONTHLY LIMIT. lib/sites/plan.ts allows 20/200/1000 AI
--     edits a month by tier, and nothing could count them. A limit
--     nothing counts is not a limit.
--
--  2. THE BILL. Tokens are recorded as REPORTED BY THE PROVIDER —
--     not estimated from the prompt — and the cost is computed from
--     them at the rate that was in force. An estimate made from a
--     price constant read at query time silently rewrites history
--     the first time a price changes.
--
--  3. "THE AI BROKE MY SITE." version_id points at the snapshot
--     taken BEFORE the run, so undo is a restore rather than an
--     apology.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_agent_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Denormalised from sites.creator_id ON PURPOSE. The monthly count
  -- runs on every agent request, and a creator whose site was deleted
  -- still used the quota — a join through `sites` would hand them the
  -- month back by deleting the evidence.
  creator_id  UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  -- The snapshot taken before this run. NULL only if snapshotting
  -- itself failed, which is also the one case where the run must not
  -- have been allowed to start.
  version_id  UUID REFERENCES site_versions(id) ON DELETE SET NULL,

  prompt      TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,

  status      TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'succeeded', 'failed', 'refused')),

  -- As reported by the provider. `input_tokens` is the TOTAL; the two
  -- cache columns are subsets of it, which is how the cost below is
  -- derived — see lib/sites/agent/models.ts.
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,

  -- Estimated, and named so. Six decimal places because a cheap model
  -- makes runs that cost $0.0004 and rounding them to cents rounds the
  -- entire free tier to zero.
  cost_usd    NUMERIC(12, 6) NOT NULL DEFAULT 0,

  -- How many round trips the tool loop took. The number that says
  -- "this prompt is pathological" before the bill does.
  turns       INTEGER NOT NULL DEFAULT 0,
  files_changed TEXT[] NOT NULL DEFAULT '{}',

  -- Developer detail, shown under "Details" only. A stack trace is not
  -- an answer for somebody who asked for a website.
  error       TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- The monthly-quota query, exactly: creator + a date range.
CREATE INDEX IF NOT EXISTS idx_sar_creator_month
  ON site_agent_runs (creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sar_site
  ON site_agent_runs (site_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
--
-- A creator reads their own runs — the history panel and "what did
-- this cost" are theirs to see. Writes are SERVER-SIDE ONLY: there is
-- deliberately no INSERT or UPDATE policy, because a client that can
-- write its own run row can write `cost_usd = 0` and mint itself
-- unlimited edits. The agent route uses the service role for those.
ALTER TABLE site_agent_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_agent_runs' AND policyname = 'sar_select_own'
  ) THEN
    CREATE POLICY sar_select_own ON site_agent_runs
      FOR SELECT USING (
        creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
      );
  END IF;
END;
$$;



-- ###########################################################################
--  SECTION 3: Publishing, chat history, and one writer per site
--  source: supabase/migrations/20260912_site_publishing.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — publishing, and the chat that produced it
-- ============================================================
--
-- Two features, one migration, because both are additive and both
-- are needed before a site can be shown to anybody.
--
--  1. PUBLISHING. A site builds to static files in object storage
--     and one deployment per site is live. The switch is a pointer
--     move, never an overwrite, so a failed build cannot take down
--     a page that was working a second earlier.
--
--  2. CHAT HISTORY. The conversation was in React state and died
--     on reload — you could not reopen a site and see what you had
--     asked for.
-- ============================================================

-- ── where published files live ───────────────────────────────
--
-- ONE bucket for every site, keyed by path. Not one bucket per
-- site: buckets are a per-project resource with their own limits,
-- and 4,000 of them is 4,000 things to enumerate, back up and
-- reason about for no isolation gain — the path already carries
-- the site id and the storage policies below key off it.
--
-- Public, because a published website is public. Nothing private
-- is ever written here: the publish step uploads built output only.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('site-deployments', 'site-deployments', true, 26214400)
ON CONFLICT (id) DO NOTHING;

-- Writes are server-side only (the publish route uses the service
-- role). A creator that could write here directly could replace
-- another creator's live page with anything at all.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'site_deployments_public_read'
  ) THEN
    CREATE POLICY site_deployments_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'site-deployments');
  END IF;
END;
$$;

-- ── deployments ──────────────────────────────────────────────
ALTER TABLE site_deployments
  -- The address this deployment was published at, captured at the
  -- time. A site can be renamed; the deployment that is serving
  -- must still know what it answers to.
  ADD COLUMN IF NOT EXISTS slug TEXT,
  -- Storage prefix: site-deployments/sites/{site_id}/{deployment_id}/
  ADD COLUMN IF NOT EXISTS storage_prefix TEXT,
  ADD COLUMN IF NOT EXISTS file_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bytes BIGINT NOT NULL DEFAULT 0,
  -- Which version of the project this was built from, so "what is
  -- live" and "what am I editing" can be compared without guessing.
  ADD COLUMN IF NOT EXISTS version_label TEXT,
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

/**
 * AT MOST ONE LIVE DEPLOYMENT PER SITE, enforced by the database.
 *
 * The publish step clears the old pointer and sets the new one, and
 * if that ever races — two publishes, a retry, a crash between the
 * two statements — the index is what stops a site from having two
 * live builds and serving whichever the query planner reached first.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_deployments_live
  ON site_deployments (site_id) WHERE is_live;

-- The lookup a visitor's request makes: slug → the live build.
-- Partial, because only live rows are ever resolved this way.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_deployments_live_slug
  ON site_deployments (lower(slug)) WHERE is_live AND slug IS NOT NULL;

-- ── the site's own record of what is live ────────────────────
ALTER TABLE sites
  -- Bumped on every write. The compare-and-swap token that stops a
  -- stale agent run from overwriting a newer edit, and the way the
  -- editor knows the live build is behind.
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
  -- The revision the live deployment was built from. Equal means
  -- published and current; lower means there are unpublished edits.
  ADD COLUMN IF NOT EXISTS published_revision INTEGER,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ── chat history ─────────────────────────────────────────────
--
-- One row per message. site_agent_runs already records what a run
-- COST; this records what was SAID, which is a different question
-- and the one a creator asks when they reopen a site a week later.
--
-- The tool steps ride in `steps` as jsonb rather than as their own
-- table: they are only ever read back with their message, never
-- queried across messages, and a second table would be a join for
-- no question anybody asks.
CREATE TABLE IF NOT EXISTS site_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id     UUID REFERENCES site_agent_runs(id) ON DELETE SET NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL DEFAULT '',
  steps      JSONB NOT NULL DEFAULT '[]',
  files_changed TEXT[] NOT NULL DEFAULT '{}',
  -- The snapshot taken before this exchange, so Undo survives a
  -- reload too. Null when the run could not be snapshotted.
  version_id UUID REFERENCES site_versions(id) ON DELETE SET NULL,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scm_site ON site_chat_messages (site_id, created_at);

ALTER TABLE site_chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  owned TEXT := '
    site_id IN (
      SELECT s.id FROM sites s
      JOIN creators c ON c.id = s.creator_id
      WHERE c.user_id = auth.uid()
    )';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_chat_messages' AND policyname = 'scm_own'
  ) THEN
    EXECUTE format('CREATE POLICY scm_own ON site_chat_messages USING (%s) WITH CHECK (%s)', owned, owned);
  END IF;
END;
$$;

-- ── one site, one writer at a time ───────────────────────────
--
-- The editor autosaves every 1.2 seconds and an agent run writes a
-- whole changed set at the end. Without this, typing during a run
-- means one of the two writes silently wins — a creator watching
-- their own edit disappear with no error.
--
-- An advisory lock rather than a job queue: it is held for the
-- length of one transaction, released automatically if the
-- connection dies, and costs nothing. Different sites never
-- contend, which is the only parallelism this needs.
--
-- Returns the new revision, or NULL when the caller's expected
-- revision is stale — the caller then re-reads and retries rather
-- than clobbering.
CREATE OR REPLACE FUNCTION site_commit_files(
  p_site_id UUID,
  p_expected_revision INTEGER,
  p_files JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_current INTEGER;
  v_path TEXT;
BEGIN
  -- Serialises writers to THIS site. hashtextextended keeps the two
  -- 32-bit halves of the uuid from colliding across sites more often
  -- than chance.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_site_id::text, 0));

  -- SECURITY INVOKER plus this select means RLS decides: a site the
  -- caller does not own returns no row, and the function returns
  -- NULL exactly as it would for a stale revision.
  SELECT revision INTO v_current FROM sites WHERE id = p_site_id;
  IF v_current IS NULL THEN RETURN NULL; END IF;
  IF p_expected_revision IS NOT NULL AND v_current <> p_expected_revision THEN
    RETURN NULL;
  END IF;

  FOR v_path IN SELECT jsonb_object_keys(p_files) LOOP
    INSERT INTO site_files (site_id, path, content)
    VALUES (p_site_id, v_path, p_files ->> v_path)
    ON CONFLICT (site_id, path) DO UPDATE
      SET content = EXCLUDED.content, updated_at = NOW();
  END LOOP;

  UPDATE sites
     SET revision = v_current + 1, updated_at = NOW()
   WHERE id = p_site_id;

  RETURN v_current + 1;
END;
$$;



-- ###########################################################################
--  SECTION 4: The lookup every visitor pays for
--  source: supabase/migrations/20260913_site_lookup_indexes.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — the lookup every visitor pays for
-- ============================================================
--
-- Resolving <slug>.storelib.com to its live deployment is the
-- first thing a visitor's request does on a cache miss, and it
-- was a SEQUENTIAL SCAN of every deployment on the platform.
--
-- Measured on Postgres 16 with 20,000 published sites:
--
--   slug ILIKE 'x'      Seq Scan     9.25 ms   (20,000 rows scanned)
--   slug =     'x'      Seq Scan     2.45 ms   (20,000 rows scanned)
--   lower(slug) = 'x'   Index Scan   0.02 ms
--
-- `uniq_site_deployments_live_slug` already exists, but it is on
-- `lower(slug)`, and neither ILIKE nor a plain equality can use an
-- expression index — the planner has no way to know the column and
-- the expression agree. The unique index stays as the correctness
-- constraint; this one exists to be READ.
--
-- A plain column index rather than a second expression index,
-- because every slug is written lowercase at the source
-- (lib/sites/slug.ts lowercases, and the hostname rule rejects
-- anything else), so the column and its lowercase form are the same
-- string and the simpler index is the one PostgREST's `eq` can use.
--
-- PARTIAL on is_live: only live rows are ever resolved this way, and
-- a site that has been published fifty times has forty-nine rows
-- that this lookup must never consider.
CREATE INDEX IF NOT EXISTS idx_site_deployments_live_slug_lookup
  ON site_deployments (slug) WHERE is_live;

-- The publish-time uniqueness probe walks up to a dozen candidate
-- slugs, and `uniq_sites_slug` is likewise on lower(slug).
CREATE INDEX IF NOT EXISTS idx_sites_slug_lookup ON sites (slug);



-- ###########################################################################
--  SECTION 5: A run outlives the connection that started it
--  source: supabase/migrations/20260914_durable_agent_runs.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — a run outlives the connection that started it
-- ============================================================
--
-- The agent route handed `request.signal` to the loop, so the
-- CLIENT'S CONNECTION WAS THE AGENT'S ABORT SIGNAL. Locking the
-- phone, switching to another app, a tunnel, a dropped 5G bar —
-- any of them aborted the run, and because files are saved in one
-- transaction at the END, the work vanished. The creator came back
-- to "nothing was changed."
--
-- Cancelling now has to travel between requests instead of riding
-- on one socket: the Stop button writes a flag here and the loop
-- reads it between turns. A flag rather than an in-memory registry
-- because the process that reads it is rarely the process that
-- wrote it — serverless gives no shared memory, and a Map in module
-- scope would work perfectly in development and never in production.
ALTER TABLE site_agent_runs
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;

-- "Is something already running for this site?" — asked on every
-- editor load, on every return to the tab, and on every poll while
-- a run is in flight. Partial, because a finished run is never the
-- answer and there are far more of those.
CREATE INDEX IF NOT EXISTS idx_site_agent_runs_active
  ON site_agent_runs (site_id, created_at DESC)
  WHERE status = 'running';

-- A run whose process died — a deploy mid-run, a hard timeout —
-- would otherwise sit at 'running' forever and block the editor with
-- a spinner nobody can clear. Anything still 'running' after 15
-- minutes is finished, because maxDuration is 300 seconds and
-- nothing legitimate reaches a quarter of an hour.
--
-- Read by the status endpoint rather than run on a schedule: a cron
-- for this would be a second moving part to keep correct, and the
-- only moment the answer matters is when somebody is asking.
CREATE OR REPLACE FUNCTION site_active_run(p_site_id UUID)
RETURNS TABLE (id UUID, prompt TEXT, model TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT r.id, r.prompt, r.model, r.created_at
  FROM site_agent_runs r
  WHERE r.site_id = p_site_id
    AND r.status = 'running'
    AND r.created_at > NOW() - INTERVAL '15 minutes'
  ORDER BY r.created_at DESC
  LIMIT 1;
$$;



-- ###########################################################################
--  SECTION 6: The cover on a site card
--  source: supabase/migrations/20260915_site_preview_covers.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — the cover on a site card
-- ============================================================
--
-- A card showed the PUBLISHED site, so an unpublished one showed
-- "Not published yet" — a grey box where the thing you spent an
-- hour on should be. The cover should be the site as you last left
-- it, published or not.
--
-- BUILT ON READ, not on write. A site autosaves every 1.2 seconds
-- and a build takes a moment; rebuilding on every keystroke would
-- burn a compile per character for a picture nobody is looking at.
-- Instead the built cover records WHICH revision it was built from,
-- and the reader compares: equal means serve what is stored, behind
-- means build it now. The cost is paid once, by whoever looks first,
-- and only when something actually changed.
--
-- Null means never built, which is the same instruction as stale.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS preview_revision INTEGER;



-- ###########################################################################
--  SECTION 7: What the project IS, remembered between runs
--  source: supabase/migrations/20260916_site_manifest.sql
-- ###########################################################################

-- ============================================================
-- Storelib AI — what the project IS, remembered between runs
-- ============================================================
--
-- The agent used to start every run with a generic system prompt
-- and the creator's one sentence. Nothing told it what the site
-- was for, who it was for, or what had already been decided — so
-- it re-derived all of that from the files each time and, being a
-- fresh reader every time, kept arriving somewhere slightly
-- different. Ask for a testimonials section twice and you get two
-- visual languages.
--
-- WHAT GOES IN HERE, AND WHAT DELIBERATELY DOES NOT.
--
-- Only things that CANNOT be read back out of the code: what the
-- business is, who it serves, the design direction in words, and
-- the decisions a creator has already made ("keep the header
-- dark", "no stock photography").
--
-- Colours, fonts, spacing and radii are NOT stored here even
-- though they are part of the project's identity. They live in
-- src/styles.css as tokens, and that file is the truth. A copy in
-- this column would be a second truth that goes stale the first
-- time somebody edits a token — and a manifest that confidently
-- states the wrong primary colour is worse than no manifest,
-- because the agent would trust it. Those facts are derived fresh
-- from the files on every run instead.
--
-- jsonb rather than columns: the shape will change as the product
-- learns what is worth remembering, and this is read by exactly
-- one consumer that already tolerates missing keys.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS manifest JSONB;



-- ###########################################################################
--  DONE — every column below should read true.
--  A false is the piece that is still missing.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.sites')              is not null as sites,
  to_regclass('public.site_files')         is not null as files,
  to_regclass('public.site_versions')      is not null as versions,
  to_regclass('public.site_deployments')   is not null as deployments,
  to_regclass('public.site_agent_runs')    is not null as cost_ledger,
  to_regclass('public.site_chat_messages') is not null as chat_history,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_deployments'
             and column_name in ('slug','is_live','storage_prefix','version_label')
           having count(*) = 4)                          as publish_columns,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='sites'
             and column_name in ('revision','published_revision')
           having count(*) = 2)                          as revision_columns,
  exists (select 1 from storage.buckets
           where id = 'site-deployments')                as storage_bucket,
  (select count(*) from pg_proc
    where proname='site_commit_files') = 1               as commit_function,
  exists (select 1 from pg_indexes where schemaname='public'
           and indexname='uniq_site_deployments_live')   as one_live_per_site;

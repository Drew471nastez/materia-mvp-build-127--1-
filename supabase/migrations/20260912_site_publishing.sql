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

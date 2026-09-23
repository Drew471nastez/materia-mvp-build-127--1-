-- ===========================================================================
--  GITHUB SYNC: a site linked to one GitHub repository
-- ===========================================================================
-- Run AFTER supabase/sql/RUN_AGENT_CONNECTIONS.sql: a push from GitHub is
-- written to theme_agent_activity, which that file creates, so an open
-- builder hears about it.
--
-- Two new tables. Nothing existing is altered. Safe to run more than once,
-- including over an earlier version of this file.
--
-- theme_github_links
--   One row per site that is linked. It holds which GitHub App installation
--   and which repository, branch and folder. It holds NO token: Storelib
--   mints a short one from the app's private key each time it needs one.
--
-- theme_github_events
--   What went each way and when: "3 sections sent to GitHub", "faq came in
--   from a push". The Connections page lists the latest few.
--
-- Creators can READ their own rows. Every write goes through the server.

CREATE TABLE IF NOT EXISTS theme_github_links (
  install_id       UUID PRIMARY KEY REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  creator_id       UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  installation_id  BIGINT NOT NULL,
  account_login    TEXT NOT NULL DEFAULT '',
  repo_id          BIGINT,
  repo_full_name   TEXT,
  branch           TEXT,
  root_path        TEXT NOT NULL DEFAULT '',
  last_synced_sha  TEXT,
  last_synced_at   TIMESTAMPTZ,
  last_error       TEXT,
  push_on_save     BOOLEAN NOT NULL DEFAULT true,
  pull_on_push     BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For a database that ran the first version of this file.
ALTER TABLE theme_github_links ADD COLUMN IF NOT EXISTS push_on_save BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE theme_github_links ADD COLUMN IF NOT EXISTS pull_on_push BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_theme_github_links_repo
  ON theme_github_links (repo_id);
CREATE INDEX IF NOT EXISTS idx_theme_github_links_installation
  ON theme_github_links (installation_id);

ALTER TABLE theme_github_links ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_github_links FROM anon, authenticated;

DROP POLICY IF EXISTS "Creators read their own GitHub link" ON theme_github_links;
CREATE POLICY "Creators read their own GitHub link"
  ON theme_github_links FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = (SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS theme_github_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  install_id  UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('to_github', 'from_github')),
  ok          BOOLEAN NOT NULL DEFAULT true,
  summary     TEXT NOT NULL CHECK (char_length(summary) <= 300),
  commit_sha  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theme_github_events_install
  ON theme_github_events (install_id, id DESC);

ALTER TABLE theme_github_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_github_events FROM anon, authenticated;

DROP POLICY IF EXISTS "Creators read their own GitHub events" ON theme_github_events;
CREATE POLICY "Creators read their own GitHub events"
  ON theme_github_events FOR SELECT
  USING (install_id IN (
    SELECT i.id FROM store_theme_installs i
    JOIN creators c ON c.id = i.creator_id
    WHERE c.user_id = (SELECT auth.uid())
  ));

-- ===========================================================================
--  AGENT CONNECTIONS: a creator lets Claude Code, Codex or any other agent
--  read and write one site's section files
-- ===========================================================================
-- Two new tables. Nothing existing is altered: no column, no policy, no
-- function. Safe to run more than once.
--
-- theme_agent_tokens
--   One row per connection a creator made. The token itself is shown to the
--   creator once and never stored: only its SHA-256 is kept, so a leaked
--   database row cannot be used to connect. A connection belongs to one
--   site (one theme install) and reaches nothing else.
--
-- theme_agent_activity
--   What connected agents wrote, so the builder, when it is open, can put a
--   new section on the page and say who wrote it.
--
-- Writes to both go through the server with the service role. Creators can
-- only READ their own rows, and never the hash.

CREATE TABLE IF NOT EXISTS theme_agent_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id    UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  creator_id    UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  token_hash    TEXT NOT NULL UNIQUE,
  prefix        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_install
  ON theme_agent_tokens (install_id);

ALTER TABLE theme_agent_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators read their own agent connections" ON theme_agent_tokens;
CREATE POLICY "Creators read their own agent connections"
  ON theme_agent_tokens FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = (SELECT auth.uid())));

-- The hash is not for anybody's browser, including its owner's. A column
-- REVOKE does nothing while the table-wide grant Supabase gives every new
-- table is in place, so the table-wide grant is taken away and the columns
-- a browser may read are granted back by name. Writes stay server-only.
REVOKE ALL ON theme_agent_tokens FROM anon, authenticated;
GRANT SELECT (id, install_id, creator_id, name, prefix, created_at, last_used_at, revoked_at)
  ON theme_agent_tokens TO authenticated;

CREATE TABLE IF NOT EXISTS theme_agent_activity (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  install_id  UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE,
  token_id    UUID REFERENCES theme_agent_tokens(id) ON DELETE SET NULL,
  agent_name  TEXT NOT NULL,
  path        TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('created', 'updated')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_install
  ON theme_agent_activity (install_id, id);

ALTER TABLE theme_agent_activity ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_agent_activity FROM anon, authenticated;

DROP POLICY IF EXISTS "Creators read their own agent activity" ON theme_agent_activity;
CREATE POLICY "Creators read their own agent activity"
  ON theme_agent_activity FOR SELECT
  USING (install_id IN (
    SELECT i.id FROM store_theme_installs i
    JOIN creators c ON c.id = i.creator_id
    WHERE c.user_id = (SELECT auth.uid())
  ));

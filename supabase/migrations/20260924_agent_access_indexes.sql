-- ===========================================================================
--  AGENT CONNECTIONS AND GITHUB SYNC: THE INDEXES THEIR FOREIGN KEYS NEED
-- ===========================================================================
-- Run after RUN_AGENT_CONNECTIONS.sql and RUN_GITHUB_SYNC.sql. Three indexes,
-- nothing else: no column, no policy, no data. Safe to run more than once,
-- and nothing in the app waits for it; without it the same queries run, only
-- slower as the tables grow.
--
-- theme_agent_tokens (creator_id)
--   Deleting a creator cascades into this table by creator_id. Without an
--   index Postgres reads every connection anybody ever made to find theirs.
--
-- theme_agent_activity (token_id)
--   Deleting a site cascades to its tokens, and each token's activity rows
--   are set to NULL by token_id: a full read of the log per token, without
--   this.
--
-- theme_github_links (creator_id)
--   The GitHub card lists the accounts a creator linked for their other
--   sites, by creator_id, every time it opens; and a creator's deletion
--   cascades by it too.
--
-- The token lookup itself needs nothing here: token_hash is UNIQUE, and a
-- unique constraint is an index.
--
-- Not CONCURRENTLY, so it can run inside the migration's transaction. On a
-- table of a few million rows each takes seconds; run it at a quiet time.

CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_creator
  ON theme_agent_tokens (creator_id);

CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_token
  ON theme_agent_activity (token_id)
  WHERE token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_theme_github_links_creator
  ON theme_github_links (creator_id);

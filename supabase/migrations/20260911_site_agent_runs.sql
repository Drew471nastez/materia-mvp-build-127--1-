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

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

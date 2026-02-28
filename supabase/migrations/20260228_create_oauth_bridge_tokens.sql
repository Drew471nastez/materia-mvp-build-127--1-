-- One-time session bridge tokens used by the Android OAuth flow.
--
-- Flow:
--   /auth/callback  (Chrome Custom Tab)  →  inserts a row, gets the UUID
--   /app/auth/callback (WebView)         →  validates, deletes row, sets cookies
--
-- Tokens expire after 2 minutes; a cleanup index is provided for pg_cron or
-- application-side pruning. RLS is enabled with no public policies — only the
-- service-role admin client may access this table.

CREATE TABLE IF NOT EXISTS public.oauth_bridge_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token  TEXT      NOT NULL,
  refresh_token TEXT      NOT NULL,
  next_path   TEXT        NOT NULL DEFAULT '/app',
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_bridge_tokens_expires_at_idx
  ON public.oauth_bridge_tokens (expires_at);

ALTER TABLE public.oauth_bridge_tokens ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — admin client (service role) bypasses RLS.

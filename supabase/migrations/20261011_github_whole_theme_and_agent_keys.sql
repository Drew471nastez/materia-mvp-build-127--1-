-- ===========================================================================
--  GITHUB SYNC OF THE WHOLE THEME, AND AGENT KEYS THAT EXPIRE OR ONLY READ
-- ===========================================================================
-- The same statements as supabase/sql/run-now/131_github_whole_theme_and_agent_keys.sql.
--
-- theme_github_links.sync_state
--   What GitHub and Storelib last agreed on, file by file (path to git blob
--   sha), and what the last sync did: the files taken, each one that was not
--   with its line and its fix, and notes. The builder lists them; the agreed
--   blobs are how a push carrying Storelib's own files back changes nothing.
--
-- theme_agent_tokens.expires_at, theme_agent_tokens.scopes
--   A connection key that stops working on a day, and one that can read the
--   site but not change it. Existing keys keep working as they did: no
--   expiry, read and write.

DO $do$ BEGIN IF to_regclass('public.theme_github_links') IS NULL THEN RAISE NOTICE 'github sync state: theme_github_links is not there yet (part 02).'; RETURN; END IF; ALTER TABLE public.theme_github_links ADD COLUMN IF NOT EXISTS sync_state jsonb NOT NULL DEFAULT '{}'::jsonb; ALTER TABLE public.theme_github_links DROP CONSTRAINT IF EXISTS theme_github_links_sync_state_check; ALTER TABLE public.theme_github_links ADD CONSTRAINT theme_github_links_sync_state_check CHECK (jsonb_typeof(sync_state) = 'object' AND pg_column_size(sync_state) < 2000000); END $do$;

DO $do$ BEGIN IF to_regclass('public.theme_agent_tokens') IS NULL THEN RAISE NOTICE 'agent keys: theme_agent_tokens is not there yet (part 02).'; RETURN; END IF; ALTER TABLE public.theme_agent_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz; ALTER TABLE public.theme_agent_tokens ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['read','write']::text[]; ALTER TABLE public.theme_agent_tokens DROP CONSTRAINT IF EXISTS theme_agent_tokens_scopes_check; ALTER TABLE public.theme_agent_tokens ADD CONSTRAINT theme_agent_tokens_scopes_check CHECK (scopes <@ ARRAY['read','write']::text[] AND 'read' = ANY (scopes)); GRANT SELECT (expires_at, scopes) ON public.theme_agent_tokens TO authenticated; END $do$;

notify pgrst, 'reload schema';

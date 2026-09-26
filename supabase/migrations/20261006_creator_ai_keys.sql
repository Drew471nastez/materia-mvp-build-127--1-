-- ===========================================================================
--  A CREATOR'S OWN AI: THEIR CLAUDE KEY, OPENAI KEY OR OPENROUTER ACCOUNT
-- ===========================================================================
-- Storelib AI answers on the creator's own account when they have connected
-- one (lib/sites/agent/provider.ts, resolveForCreator), and those runs do
-- not count against the plan's AI edits.
--
-- The key is never stored as text: `sealed_key` is AES-256-GCM, sealed by
-- the server (lib/ai-keys/crypto.ts). Row level security is on and there is
-- NO policy, so no browser, the owner's included, can read a row; only the
-- server's admin client does, and it hands back the last four characters.

CREATE TABLE IF NOT EXISTS public.creator_ai_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  sealed_key    text NOT NULL CHECK (length(sealed_key) BETWEEN 20 AND 2000),
  key_hint      text NOT NULL DEFAULT '' CHECK (length(key_hint) <= 8),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  last_error    text CHECK (last_error IS NULL OR length(last_error) <= 300),
  UNIQUE (creator_id, provider)
);

ALTER TABLE public.creator_ai_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_ai_keys FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

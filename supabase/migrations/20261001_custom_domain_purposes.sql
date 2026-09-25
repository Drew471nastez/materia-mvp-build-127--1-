-- ===========================================================================
--  CONNECTED DOMAINS: WHAT EACH ONE IS FOR, AND WHICH ONE IS PRIMARY
-- ===========================================================================
-- A creator can connect a domain to their WEBSITE (the site built in the
-- website builder) or to their CREATOR PAGE (storelib.com/<handle>, its
-- products under it, the OnePage at /links). Several of each; one of each
-- purpose is primary, and the others redirect to it.
--
-- The same statements, one per line, are supabase/sql/run-now/22_custom_domain_purposes.sql.
-- Safe to run twice. The app works before it runs: lib/custom-domains/store.ts
-- reads the table without these columns and offers website domains only.

-- 1. The columns. Every existing domain is a website domain: that is what
--    proxy.ts served at it (the creator page only when no website is published).
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'website';
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
-- The records Vercel last recommended (A, CNAME, and any TXT challenge), so the
-- Domains tab lists them without asking Vercel on every load.
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS dns_records JSONB;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_purpose_check;
ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_purpose_check CHECK (purpose IN ('website', 'creator_page')) NOT VALID;

-- 2. Each creator's oldest domain becomes the primary one (before this, a
--    creator had one domain; adding another replaced it).
UPDATE public.custom_domains d SET is_primary = true WHERE d.id IN (SELECT DISTINCT ON (creator_id, purpose) id FROM public.custom_domains ORDER BY creator_id, purpose, created_at ASC) AND NOT EXISTS (SELECT 1 FROM public.custom_domains p WHERE p.creator_id = d.creator_id AND p.purpose = d.purpose AND p.is_primary);

-- 3. One primary per creator and purpose, held by the database.
CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_primary ON public.custom_domains (creator_id, purpose) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_custom_domains_creator_purpose ON public.custom_domains (creator_id, purpose);

-- 4. Written by the server only. A creator could insert, update and delete
--    their own rows straight from the browser with the public key, which let
--    a row be marked 'active' without its DNS ever being checked, and skip
--    the rate limit, the reserved names and the Vercel registration. The API
--    routes check the session and write with the service role; reading your
--    own rows is unchanged.
DROP POLICY IF EXISTS "Creators can add own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can update own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can delete own domains" ON public.custom_domains;
REVOKE INSERT, UPDATE, DELETE ON public.custom_domains FROM anon, authenticated;
DO $$ BEGIN IF to_regclass('public.domain_redirects') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE ON public.domain_redirects FROM anon, authenticated; END IF; END $$;

/* Connected domains: website or creator page, one primary of each, the DNS records Vercel recommended, and written by the server only. Source: supabase/migrations/20261001_custom_domain_purposes.sql. */
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'website';
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS dns_records JSONB;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_purpose_check;
ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_purpose_check CHECK (purpose IN ('website', 'creator_page')) NOT VALID;
UPDATE public.custom_domains d SET is_primary = true WHERE d.id IN (SELECT DISTINCT ON (creator_id, purpose) id FROM public.custom_domains ORDER BY creator_id, purpose, created_at ASC) AND NOT EXISTS (SELECT 1 FROM public.custom_domains p WHERE p.creator_id = d.creator_id AND p.purpose = d.purpose AND p.is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_primary ON public.custom_domains (creator_id, purpose) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_custom_domains_creator_purpose ON public.custom_domains (creator_id, purpose);
DROP POLICY IF EXISTS "Creators can add own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can update own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can delete own domains" ON public.custom_domains;
REVOKE INSERT, UPDATE, DELETE ON public.custom_domains FROM anon, authenticated;
DO $$ BEGIN IF to_regclass('public.domain_redirects') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE ON public.domain_redirects FROM anon, authenticated; END IF; END $$;

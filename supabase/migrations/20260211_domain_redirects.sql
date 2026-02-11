-- Domain Redirects Memory System
-- Remembers old domains when sellers remove or change their custom domain
-- Keeps old domains attached to Vercel for a grace period so traffic still redirects
-- Prevents DEPLOYMENT_NOT_FOUND errors and broken shared links

-- ============================================================================
-- DOMAIN REDIRECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.domain_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  redirect_to TEXT NOT NULL, -- new domain URL or fallback subdomain URL
  http_code INTEGER NOT NULL DEFAULT 301, -- 301 permanent or 302 temporary
  reason TEXT NOT NULL DEFAULT 'removed', -- 'removed' or 'changed'
  keep_until TIMESTAMPTZ NOT NULL, -- grace period end date
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_redirect_domain UNIQUE (domain)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_domain_redirects_domain ON public.domain_redirects(domain);
CREATE INDEX IF NOT EXISTS idx_domain_redirects_creator ON public.domain_redirects(creator_id);
CREATE INDEX IF NOT EXISTS idx_domain_redirects_keep_until ON public.domain_redirects(keep_until);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.domain_redirects ENABLE ROW LEVEL SECURITY;

-- Creators can view their own redirects
CREATE POLICY "Creators can view own domain redirects"
  ON public.domain_redirects FOR SELECT
  USING (creator_id IN (
    SELECT id FROM public.creators WHERE user_id = auth.uid()
  ));

-- Service role has full access (for API routes and middleware)
CREATE POLICY "Service role full access to domain_redirects"
  ON public.domain_redirects FOR ALL
  USING (auth.role() = 'service_role');

-- Public read for active redirects (needed for domain resolution in middleware)
CREATE POLICY "Public can read domain redirects"
  ON public.domain_redirects FOR SELECT
  USING (keep_until > NOW());

-- ============================================================================
-- Add previous_domain column to custom_domains for tracking domain changes
-- ============================================================================
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS previous_domain TEXT;

-- ============================================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_domain_redirects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_redirects_updated_at
  BEFORE UPDATE ON public.domain_redirects
  FOR EACH ROW
  EXECUTE FUNCTION update_domain_redirects_updated_at();

-- Custom Domains Feature Migration
-- Allows creators to connect their own domain to their store and OnePage
-- e.g., theirdomain.com → store, theirdomain.com/links → OnePage

-- ============================================================================
-- CUSTOM DOMAINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'verifying', 'active', 'failed'
  verification_token TEXT, -- TXT record value for DNS verification
  verified_at TIMESTAMPTZ,
  ssl_status TEXT DEFAULT 'pending', -- 'pending', 'active', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_domain UNIQUE (domain),
  CONSTRAINT unique_creator_domain UNIQUE (creator_id, domain)
);

-- Index for fast domain lookups (used in middleware/routing)
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON public.custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_creator ON public.custom_domains(creator_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON public.custom_domains(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;

-- Creators can view their own domains
CREATE POLICY "Creators can view own domains"
  ON public.custom_domains FOR SELECT
  USING (creator_id IN (
    SELECT id FROM public.creators WHERE user_id = auth.uid()
  ));

-- Creators can insert their own domains
CREATE POLICY "Creators can add own domains"
  ON public.custom_domains FOR INSERT
  WITH CHECK (creator_id IN (
    SELECT id FROM public.creators WHERE user_id = auth.uid()
  ));

-- Creators can update their own domains
CREATE POLICY "Creators can update own domains"
  ON public.custom_domains FOR UPDATE
  USING (creator_id IN (
    SELECT id FROM public.creators WHERE user_id = auth.uid()
  ));

-- Creators can delete their own domains
CREATE POLICY "Creators can delete own domains"
  ON public.custom_domains FOR DELETE
  USING (creator_id IN (
    SELECT id FROM public.creators WHERE user_id = auth.uid()
  ));

-- Service role has full access (for API routes and middleware)
CREATE POLICY "Service role full access to custom_domains"
  ON public.custom_domains FOR ALL
  USING (auth.role() = 'service_role');

-- Public read for active domains (needed for domain resolution in middleware)
CREATE POLICY "Public can read active domains"
  ON public.custom_domains FOR SELECT
  USING (status = 'active');

-- ============================================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON public.custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_domains_updated_at();

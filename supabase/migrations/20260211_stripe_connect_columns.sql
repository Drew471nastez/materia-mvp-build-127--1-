-- Add missing Stripe Connect columns to creators table
-- These are needed for the Connect Express onboarding flow

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick lookups by Stripe account ID
CREATE INDEX IF NOT EXISTS idx_creators_stripe_account ON public.creators(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

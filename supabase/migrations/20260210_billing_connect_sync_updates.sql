-- Billing + Stripe Connect sync enhancements
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_id TEXT;

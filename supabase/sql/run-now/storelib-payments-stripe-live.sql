-- =============================================================================
-- STORELIB PAYMENTS (STRIPE CONNECT) — LIVE / PROD IDEMPOTENT SCRIPT
-- Run once in Supabase SQL Editor (service role). Safe to re-run.
-- Matches app commits: Storelib Payments hub, webhooks, fee audit on orders.
-- =============================================================================

-- ── 1. Creators: Stripe Connect state ───────────────────────────────────────
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_status text NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS stripe_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details_submitted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_creators_stripe_account
  ON public.creators (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Stripe requirement tracking (reminders / action required UI)
DO $$
BEGIN
  IF to_regclass('public.creators') IS NULL THEN
    RAISE NOTICE 'creators table missing — skip stripe_requirements';
  ELSE
    ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS stripe_requirements text[];
    ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS stripe_requirements_due_at timestamptz;
    ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS stripe_requirements_updated_at timestamptz;
  END IF;
END $$;

-- ── 2. Orders: fees + audit fields (PaymentIntent metadata) ─────────────────
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'orders table missing — skip order fee columns';
  ELSE
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_cents integer DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS application_fee_cents integer DEFAULT 0;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider_payment_id text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS plan_used text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pricing_tier text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_rule_version text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS storelib_net_margin_cents integer;
    CREATE INDEX IF NOT EXISTS orders_stripe_balance_transaction_id_idx
      ON public.orders (stripe_balance_transaction_id)
      WHERE stripe_balance_transaction_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_payment_id_key
      ON public.orders (provider_payment_id)
      WHERE provider_payment_id IS NOT NULL;
  END IF;
END $$;

-- ── 3. Payouts log (Connect cashouts / Stripe payout webhooks) ───────────────
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  stripe_payout_id text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  arrival_date timestamptz,
  description text,
  destination text,
  method text,
  failure_code text,
  failure_message text,
  stripe_created timestamptz,
  webhook_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_creator_id_idx ON public.payouts(creator_id);
CREATE INDEX IF NOT EXISTS payouts_stripe_payout_id_idx ON public.payouts(stripe_payout_id);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creators can view own payouts" ON public.payouts;
CREATE POLICY "creators can view own payouts"
  ON public.payouts FOR SELECT
  USING (
    creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.update_payouts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payouts_updated_at ON public.payouts;
CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_payouts_updated_at();

-- ── 4. Stripe webhook idempotency ledger ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  account text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 1,
  last_error text
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_unfinished_idx
  ON public.stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;

-- ── 5. Seller ledger row per creator (if table exists) ───────────────────────
DO $$
BEGIN
  IF to_regclass('public.seller_ledger') IS NULL THEN
    RAISE NOTICE 'seller_ledger missing — skip backfill';
  ELSE
    INSERT INTO public.seller_ledger (creator_id)
    SELECT c.id FROM public.creators c
    ON CONFLICT (creator_id) DO NOTHING;
  END IF;
END $$;

-- ── 6. Admin fee rule versions + payments audit ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.storelib_fee_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'draft', 'retired')),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'admin session',
  config jsonb NOT NULL,
  change_summary text,
  UNIQUE (version_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS storelib_fee_rule_versions_one_active
  ON public.storelib_fee_rule_versions ((status))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.admin_payments_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'admin session',
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storelib_fee_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_payments_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_fee_rule_versions FROM anon, authenticated;
REVOKE ALL ON public.admin_payments_audit_log FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

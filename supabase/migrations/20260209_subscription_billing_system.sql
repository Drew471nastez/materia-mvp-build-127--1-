-- Subscription Billing System Migration
-- Creates tables for subscription plans, subscriptions, payment methods, and invoices
-- Adds subscription fields to creators table
-- Sets up RLS policies for secure access

-- ============================================================================
-- SUBSCRIPTION PLANS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  billing_period TEXT, -- 'month' for paid plans, NULL for free
  fee_percent DECIMAL(5,4) NOT NULL, -- 0.0600 = 6%, 0.0300 = 3%, 0.0150 = 1.5%
  fee_fixed_cents INTEGER NOT NULL, -- 25 = $0.25
  stripe_price_id TEXT, -- Stripe Price ID for paid plans
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'canceled', 'trialing', 'incomplete'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_creator_subscription UNIQUE (creator_id)
);

-- ============================================================================
-- PAYMENT METHODS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'card', 'bank_account', etc.
  card_brand TEXT, -- 'visa', 'mastercard', 'amex', 'discover'
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INVOICES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'paid', 'open', 'void', 'uncollectible', 'draft'
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ADD SUBSCRIPTION FIELDS TO CREATORS TABLE
-- ============================================================================
ALTER TABLE public.creators
ADD COLUMN IF NOT EXISTS subscription_plan_id TEXT DEFAULT 'free' REFERENCES public.subscription_plans(id),
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_creator ON public.subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_creator ON public.payment_methods(creator_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_pm ON public.payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON public.payment_methods(creator_id, is_default) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_invoices_creator ON public.invoices(creator_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice ON public.invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE INDEX IF NOT EXISTS idx_creators_subscription_plan ON public.creators(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_creators_stripe_customer ON public.creators(stripe_customer_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Subscription Plans: Public read access for active plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON public.subscription_plans
  FOR SELECT
  USING (is_active = true);

-- Subscriptions: Creators can view and manage their own subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM public.creators WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to subscriptions"
  ON public.subscriptions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Payment Methods: Creators can view and manage their own payment methods
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can manage own payment methods"
  ON public.payment_methods
  FOR ALL
  USING (
    creator_id IN (
      SELECT id FROM public.creators WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to payment methods"
  ON public.payment_methods
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Invoices: Creators can view their own invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own invoices"
  ON public.invoices
  FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM public.creators WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to invoices"
  ON public.invoices
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- SEED SUBSCRIPTION PLANS
-- ============================================================================
INSERT INTO public.subscription_plans (id, name, price_cents, billing_period, fee_percent, fee_fixed_cents, stripe_price_id, features, is_active) VALUES
('free', 'Free', 0, NULL, 0.0600, 25, NULL, '["6% + $0.25 per transaction", "Basic analytics", "Standard support"]'::jsonb, true),
('growth', 'Growth', 2900, 'month', 0.0300, 25, NULL, '["$29/month", "3% + $0.25 per transaction", "Advanced analytics", "Priority support", "Custom domain"]'::jsonb, true),
('pro', 'Pro', 9900, 'month', 0.0150, 25, NULL, '["$99/month", "1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label options", "API access"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  billing_period = EXCLUDED.billing_period,
  fee_percent = EXCLUDED.fee_percent,
  fee_fixed_cents = EXCLUDED.fee_fixed_cents,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- ============================================================================
-- UPDATE EXISTING CREATORS TO FREE PLAN
-- ============================================================================
UPDATE public.creators
SET subscription_plan_id = 'free',
    subscription_status = 'active'
WHERE subscription_plan_id IS NULL;

-- ============================================================================
-- TRIGGER FUNCTIONS FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON public.payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE public.subscription_plans IS 'Defines available subscription tiers with pricing and platform fee structures';
COMMENT ON TABLE public.subscriptions IS 'Tracks creator subscriptions to paid plans, synced with Stripe';
COMMENT ON TABLE public.payment_methods IS 'Stores creator payment methods for subscription billing';
COMMENT ON TABLE public.invoices IS 'Historical record of subscription invoices from Stripe';

COMMENT ON COLUMN public.subscription_plans.fee_percent IS 'Platform fee percentage as decimal (e.g., 0.0600 = 6%)';
COMMENT ON COLUMN public.subscription_plans.fee_fixed_cents IS 'Fixed platform fee in cents (e.g., 25 = $0.25)';
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'If true, subscription cancels at end of current billing period';
COMMENT ON COLUMN public.payment_methods.is_default IS 'Primary payment method for the creator';

-- Auditable Storelib fee fields on completed orders (from PaymentIntent metadata).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS plan_used text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pricing_tier text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_rule_version text;

-- Stripe-reported economics (never estimated; filled when balance_transaction is available).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS storelib_net_margin_cents integer;

CREATE INDEX IF NOT EXISTS orders_stripe_balance_transaction_id_idx
  ON public.orders (stripe_balance_transaction_id)
  WHERE stripe_balance_transaction_id IS NOT NULL;

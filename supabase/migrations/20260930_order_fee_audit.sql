-- Auditable Storelib fee fields on completed orders (from PaymentIntent metadata).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS plan_used text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pricing_tier text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_rule_version text;

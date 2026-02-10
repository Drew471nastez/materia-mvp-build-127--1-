-- Track normalized fee and plan used per checkout order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS platform_fee_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS plan_used TEXT;

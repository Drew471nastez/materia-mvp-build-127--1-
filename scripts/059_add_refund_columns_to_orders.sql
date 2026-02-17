-- =====================================================
-- ADD REFUND TRACKING COLUMNS TO ORDERS TABLE
-- Run this in Supabase SQL Editor
-- =====================================================

-- Refund tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

-- Update existing orders: copy buyer_email to customer_email where missing
UPDATE public.orders
SET customer_email = buyer_email
WHERE customer_email IS NULL AND buyer_email IS NOT NULL;

-- Update CHECK constraint to include 'refunded' status (if it doesn't already)
-- The original constraint was: CHECK (status IN ('pending', 'completed', 'refunded', 'failed'))
-- 'refunded' is already included in the original schema, so no change needed.

-- Create index for refund lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_refund_id ON public.orders(stripe_refund_id) WHERE stripe_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_refunded_at ON public.orders(refunded_at) WHERE refunded_at IS NOT NULL;

-- =====================================================
-- VERIFY: Check if any orders should be marked as refunded
-- Run this to see orders that might have been refunded via Stripe
-- but not updated in the database:
-- =====================================================
-- SELECT id, status, stripe_payment_intent_id, refunded_at, stripe_refund_id
-- FROM public.orders
-- WHERE status != 'refunded' AND stripe_refund_id IS NOT NULL;

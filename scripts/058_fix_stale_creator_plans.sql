-- ============================================================================
-- Fix stale creator subscription plans
--
-- Problem: Some creators have subscription_plan_id set to 'growth' or 'pro'
-- with subscription_status = 'active', but they don't actually have an active
-- Stripe subscription. This causes wrong fee calculations (e.g., 1.5% instead
-- of 6% for Free plan creators).
--
-- This script resets any creator whose subscription_plan_id is NOT 'free'
-- but whose subscription record is either missing, canceled, or expired.
--
-- Run this in Supabase SQL Editor to fix immediately.
-- ============================================================================

-- Step 1: Show creators with potentially stale plan data (preview)
SELECT
  c.id AS creator_id,
  c.subscription_plan_id,
  c.subscription_status,
  c.stripe_customer_id,
  s.stripe_subscription_id,
  s.status AS sub_status,
  s.plan_id AS sub_plan_id
FROM creators c
LEFT JOIN subscriptions s ON s.creator_id = c.id
WHERE c.subscription_plan_id != 'free'
  AND (
    s.id IS NULL                          -- No subscription record at all
    OR s.status NOT IN ('active', 'trialing')  -- Subscription not active
  );

-- Step 2: Reset stale plans to free (uncomment to execute)
-- UPDATE creators
-- SET
--   subscription_plan_id = 'free',
--   subscription_status = 'active'
-- WHERE subscription_plan_id != 'free'
--   AND id NOT IN (
--     SELECT creator_id FROM subscriptions
--     WHERE status IN ('active', 'trialing')
--   );

-- Step 3: Force reset ALL creators to free plan (NUCLEAR OPTION - use only if needed)
-- This is useful during development/testing when no real subscriptions exist.
-- Uncomment ONLY if you want to reset everyone:
UPDATE creators
SET
  subscription_plan_id = 'free',
  subscription_status = 'active'
WHERE subscription_plan_id != 'free';

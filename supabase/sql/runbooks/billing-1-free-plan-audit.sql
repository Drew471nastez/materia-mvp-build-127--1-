-- ===========================================================================
--  Creators who may have been put on Free while paying (READ ONLY)
-- ===========================================================================
--  Supabase SQL editor. Every statement is a SELECT; nothing is written.
--  Run the statements one at a time and keep the results: they are the list
--  scripts/reconcile-creator-plans.ts is then run against, dry run first.
--
--  WHY THESE SHAPES. Before the fix, three paths wrote Free:
--   1. GET /api/billing/subscription: a Stripe error or timeout fell through
--      to "no subscription" and set creators.subscription_plan_id = 'free',
--      subscription_status = 'active'. It never touched the subscriptions
--      row, so the row still says active / trialing / past_due.
--   2. The billing overview (Settings > Plan) did the same (its Step 5), and
--      wrote creator_plan_overrides.paid_plan_id = 'free' for comped creators.
--   3. lib/stripe.ts made a NEW Stripe customer on any retrieve error and
--      stored it on creators, so later reads looked at an empty customer.
--      The subscriptions row keeps the customer that pays.
--  Also: the webhook wrote Free for past_due (the read wrote it back), and
--  swallowed its own write errors, answering Stripe 200.
--
--  None of these is proof. A creator listed here is checked against Stripe
--  by the reconciliation script before anything changes.
-- ===========================================================================

SET default_transaction_read_only = on;

-- A. Free on creators, paying on the subscriptions row (fingerprint of 1 and 2).
SELECT
  c.id AS creator_id,
  c.slug,
  c.subscription_plan_id AS creator_plan,
  c.subscription_status AS creator_status,
  c.stripe_customer_id AS creator_customer,
  s.stripe_subscription_id,
  s.stripe_customer_id AS subscription_customer,
  s.plan_id AS subscription_plan,
  s.status AS subscription_status,
  s.current_period_end,
  s.cancel_at_period_end,
  s.updated_at AS subscription_row_updated_at,
  (c.stripe_customer_id IS DISTINCT FROM s.stripe_customer_id) AS customer_was_replaced
FROM public.creators c
JOIN public.subscriptions s ON s.creator_id = c.id
WHERE coalesce(c.subscription_plan_id, 'free') = 'free'
  AND s.status IN ('active', 'trialing', 'past_due')
ORDER BY s.current_period_end DESC NULLS LAST;

-- B. The stored customer differs from the customer on the subscriptions row (fingerprint of 3), whatever the plan.
SELECT
  c.id AS creator_id,
  c.slug,
  c.subscription_plan_id AS creator_plan,
  c.stripe_customer_id AS creator_customer,
  s.stripe_customer_id AS subscription_customer,
  s.stripe_subscription_id,
  s.status AS subscription_status,
  s.current_period_end
FROM public.creators c
JOIN public.subscriptions s ON s.creator_id = c.id
WHERE s.stripe_customer_id IS NOT NULL
  AND c.stripe_customer_id IS DISTINCT FROM s.stripe_customer_id
ORDER BY s.current_period_end DESC NULLS LAST;

-- C. A comped creator whose paid plan was noted as Free while the subscriptions row says paying (path 2).
SELECT
  o.creator_id,
  o.plan_id AS override_plan,
  o.paid_plan_id,
  o.paid_status,
  o.set_at,
  s.stripe_subscription_id,
  s.plan_id AS subscription_plan,
  s.status AS subscription_status,
  s.current_period_end
FROM public.creator_plan_overrides o
JOIN public.subscriptions s ON s.creator_id = o.creator_id
WHERE coalesce(o.paid_plan_id, 'free') = 'free'
  AND s.status IN ('active', 'trialing', 'past_due');

-- D. Creators on Free whose plan started (subscription.created) and never ended (no subscription.cancelled with ended),
--    from the notification outbox (run-now part 40). Catches a creator whose subscriptions row was also overwritten.
SELECT
  c.id AS creator_id,
  c.slug,
  c.subscription_plan_id AS creator_plan,
  created.entity_id AS stripe_subscription_id,
  created.occurred_at AS started_at,
  created.payload ->> 'planId' AS plan_at_start
FROM public.notification_events created
JOIN public.creators c ON c.id = created.creator_id
WHERE created.name = 'subscription.created'
  AND coalesce(c.subscription_plan_id, 'free') = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_events ended
    WHERE ended.name = 'subscription.cancelled'
      AND ended.entity_id = created.entity_id
      AND (ended.payload ->> 'ended')::boolean IS TRUE
  )
ORDER BY created.occurred_at DESC;

-- E. Subscription events the webhook recorded as failed or never finished (run-now part 64).
--    Each can be re-sent from the Stripe dashboard (Developers > Events) once the fix is deployed.
SELECT event_id, type, received_at, processed_at, attempts, last_error
FROM public.stripe_webhook_events
WHERE type LIKE 'customer.subscription.%'
  AND (processed_at IS NULL OR last_error IS NOT NULL)
ORDER BY received_at DESC;

-- F. How many creators sit in each shape, for the report.
SELECT
  count(*) FILTER (WHERE coalesce(c.subscription_plan_id, 'free') = 'free' AND s.status IN ('active', 'trialing', 'past_due')) AS free_while_row_paying,
  count(*) FILTER (WHERE s.stripe_customer_id IS NOT NULL AND c.stripe_customer_id IS DISTINCT FROM s.stripe_customer_id) AS customer_replaced,
  count(*) FILTER (WHERE coalesce(c.subscription_plan_id, 'free') = 'free' AND s.status = 'past_due') AS free_while_past_due
FROM public.creators c
JOIN public.subscriptions s ON s.creator_id = c.id;

SET default_transaction_read_only = off;

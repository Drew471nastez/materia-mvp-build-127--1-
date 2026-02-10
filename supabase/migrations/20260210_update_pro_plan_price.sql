-- Update Pro plan price to $99/month
UPDATE public.subscription_plans
SET price_cents = 9900,
    features = '["$99/month", "1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label options", "API access"]'::jsonb
WHERE id = 'pro';

-- Update Pro plan price to $100/month as specified
UPDATE public.subscription_plans
SET price_cents = 10000,
    features = '["$100/month", "1.5% + $0.25 per transaction", "Premium analytics", "Dedicated support", "White-label options", "API access"]'::jsonb
WHERE id = 'pro';

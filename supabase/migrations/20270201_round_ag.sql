-- Round AG: community plans and memberships. Safe to run again.

-- A free trial is none, or 7 to 90 days. Plans saved with a shorter trial get 7 (the app already treats them as 7).
UPDATE public.membership_plans SET trial_days = 7, updated_at = now() WHERE trial_days BETWEEN 1 AND 6;
ALTER TABLE public.membership_plans DROP CONSTRAINT IF EXISTS membership_plans_trial;
ALTER TABLE public.membership_plans ADD CONSTRAINT membership_plans_trial CHECK (trial_days = 0 OR trial_days BETWEEN 7 AND 90);

-- Add onboarding_completed column to onepages table
-- This tracks whether the user has completed the Onepage onboarding
-- The onboarding should only show once per account, stored in database not localStorage

ALTER TABLE onepages ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_onepages_onboarding_completed ON onepages(onboarding_completed);

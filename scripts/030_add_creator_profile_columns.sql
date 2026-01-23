-- Add missing profile columns to creators table for onboarding data
-- These columns store creator profile information from the onboarding flow

ALTER TABLE creators ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS twitter_url TEXT;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_creators_username ON creators(username);

-- Update any existing creators that don't have onboarding_completed set
-- (if they exist, they've completed onboarding in some form)
UPDATE creators
SET onboarding_completed = true
WHERE onboarding_completed IS NULL OR onboarding_completed = false;

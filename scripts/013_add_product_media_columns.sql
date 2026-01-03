-- Add gallery and video columns to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add cover_url column to creators table for cover images
ALTER TABLE creators
ADD COLUMN IF NOT EXISTS cover_url TEXT,
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS goals TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS show_on_explore BOOLEAN DEFAULT true;

-- Add cover_url to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cover_url TEXT;

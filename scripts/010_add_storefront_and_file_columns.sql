-- Add store_published flag to creators for publish/unpublish storefront
ALTER TABLE creators ADD COLUMN IF NOT EXISTS store_published BOOLEAN DEFAULT false;

-- Add file_size to digital_assets
ALTER TABLE digital_assets ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Add username to profiles for /u/[username] route
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Create index on product slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

-- Update RLS policy for creators to include published check
DROP POLICY IF EXISTS "Public creators are viewable by everyone" ON creators;
CREATE POLICY "Public creators are viewable by everyone" ON creators
  FOR SELECT USING (store_published = true OR auth.uid() = user_id);

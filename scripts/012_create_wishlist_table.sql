-- Create wishlist_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id TEXT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id),
  UNIQUE(guest_id, product_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_guest_id ON wishlist_items(guest_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product_id ON wishlist_items(product_id);

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can view own wishlist" ON wishlist_items;
DROP POLICY IF EXISTS "Users can manage own wishlist" ON wishlist_items;
DROP POLICY IF EXISTS "Service role has full access" ON wishlist_items;

-- Enable RLS
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view own wishlist
CREATE POLICY "Users can view own wishlist"
ON wishlist_items
FOR SELECT
USING (
  auth.uid() = user_id OR
  (user_id IS NULL AND guest_id IS NOT NULL)
);

-- Policy: Users can manage own wishlist
CREATE POLICY "Users can manage own wishlist"
ON wishlist_items
FOR ALL
USING (
  auth.uid() = user_id OR
  (user_id IS NULL AND guest_id IS NOT NULL)
);

-- Grant access to authenticated users
GRANT ALL ON wishlist_items TO authenticated;
GRANT ALL ON wishlist_items TO anon;

-- Create download_events table for tracking downloads
CREATE TABLE IF NOT EXISTS download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID REFERENCES entitlements(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip TEXT
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_download_events_entitlement ON download_events(entitlement_id);
CREATE INDEX IF NOT EXISTS idx_download_events_order ON download_events(order_id);

-- Enable RLS
ALTER TABLE download_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own download events
CREATE POLICY "Users can view their own downloads" ON download_events
  FOR SELECT USING (
    entitlement_id IN (
      SELECT id FROM entitlements WHERE buyer_id = auth.uid()
    )
    OR
    order_id IN (
      SELECT id FROM orders WHERE buyer_id = auth.uid()
    )
  );

-- System can insert download events
CREATE POLICY "System can insert download events" ON download_events
  FOR INSERT WITH CHECK (true);

-- Add tip_cents column to orders if not exists
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_cents INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd';

-- Create subscribers table for email subscriptions
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_creator_subscriber UNIQUE (creator_id, email)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_id ON subscribers(creator_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

-- Enable RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Policy: Creators can view their own subscribers
CREATE POLICY "Creators can view their subscribers"
  ON subscribers
  FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  );

-- Policy: Anyone can insert subscribers (for public subscribe forms)
CREATE POLICY "Anyone can subscribe"
  ON subscribers
  FOR INSERT
  WITH CHECK (true);

-- Add Stripe Connect fields to creators table
ALTER TABLE creators
ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS statement_descriptor TEXT,
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS paypal_merchant_id TEXT,
ADD COLUMN IF NOT EXISTS allow_paypal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create payment_connection_events audit table
CREATE TABLE IF NOT EXISTS payment_connection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  event_type TEXT NOT NULL CHECK (event_type IN ('connected', 'disconnected', 'onboarding_started', 'onboarding_completed', 'onboarding_failed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_connection_events_creator_id ON payment_connection_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_payment_connection_events_created_at ON payment_connection_events(created_at);

-- Enable RLS on payment_connection_events
ALTER TABLE payment_connection_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Creators can view their own payment connection events
CREATE POLICY "Creators can view their own payment events"
  ON payment_connection_events FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: System can insert payment connection events
CREATE POLICY "System can insert payment events"
  ON payment_connection_events FOR INSERT
  WITH CHECK (true);

-- Add unique constraint on stripe_account_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_stripe_account_id 
  ON creators(stripe_account_id) 
  WHERE stripe_account_id IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on creators
DROP TRIGGER IF EXISTS update_creators_updated_at ON creators;
CREATE TRIGGER update_creators_updated_at
  BEFORE UPDATE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

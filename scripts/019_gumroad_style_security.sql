-- Add receipt_token to orders table (unique access URL per order)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_token TEXT UNIQUE;

-- Add allowed_fingerprints array (track up to 3 verified devices)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS allowed_fingerprints TEXT[] DEFAULT '{}';

-- Create security_events table for audit logging
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'receipt_accessed', 'fingerprint_mismatch', 'verification_sent', 'verification_success', 'download_issued', 'device_limit_reached'
  ip TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create verification_codes table for email verification
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_receipt_token ON orders(receipt_token);
CREATE INDEX IF NOT EXISTS idx_security_events_order_id ON security_events(order_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_order_id ON verification_codes(order_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);

-- RLS Policies
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- System can insert security events
CREATE POLICY "System can insert security events" ON security_events
  FOR INSERT
  WITH CHECK (true);

-- Users can view their own security events (via order ownership)
CREATE POLICY "Users can view their own security events" ON security_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = security_events.order_id
      AND orders.buyer_id = auth.uid()
    )
  );

-- System can manage verification codes
CREATE POLICY "System can insert verification codes" ON verification_codes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update verification codes" ON verification_codes
  FOR UPDATE
  USING (true);

CREATE POLICY "System can select verification codes" ON verification_codes
  FOR SELECT
  USING (true);

-- Populate receipt_token for existing orders without one
UPDATE orders 
SET receipt_token = encode(gen_random_bytes(24), 'base64')
WHERE receipt_token IS NULL;

-- Make receipt_token NOT NULL after populating
ALTER TABLE orders ALTER COLUMN receipt_token SET NOT NULL;

COMMENT ON TABLE security_events IS 'Audit log for download security events';
COMMENT ON TABLE verification_codes IS 'One-time codes for email verification on new devices';
COMMENT ON COLUMN orders.receipt_token IS 'Unique token for accessing order receipt page';
COMMENT ON COLUMN orders.allowed_fingerprints IS 'Array of up to 3 verified device fingerprints';

-- Add Stripe capability tracking columns to creators table
ALTER TABLE creators
ADD COLUMN IF NOT EXISTS charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN DEFAULT false;

-- Add transfer tracking to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS transfer_id TEXT,
ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_creators_stripe_capabilities ON creators(charges_enabled, payouts_enabled);
CREATE INDEX IF NOT EXISTS idx_orders_transfer ON orders(transfer_id);

-- Update existing creators with connected accounts to check their status
-- (This will be done via the status sync endpoint)

COMMENT ON COLUMN creators.charges_enabled IS 'Whether the connected Stripe account can accept charges';
COMMENT ON COLUMN creators.payouts_enabled IS 'Whether the connected Stripe account can receive payouts';
COMMENT ON COLUMN orders.transfer_id IS 'Stripe transfer ID for destination charge';
COMMENT ON COLUMN orders.application_fee_cents IS 'Platform fee collected by Materia (6% + $0.30)';

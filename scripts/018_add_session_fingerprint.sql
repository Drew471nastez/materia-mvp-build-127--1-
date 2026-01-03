-- Add session fingerprint column to orders for device binding
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_fingerprint TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_session_fingerprint ON orders(session_fingerprint);

-- Add comment
COMMENT ON COLUMN orders.session_fingerprint IS 'Unique session fingerprint for device binding to prevent link sharing';

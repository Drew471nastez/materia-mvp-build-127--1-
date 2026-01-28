-- Migration: Add variant fields to orders table
-- This allows tracking which variant was purchased with full snapshot data
--
-- Fields:
--   variant_id: Foreign key to the purchased variant
--   variant_name: Snapshot of variant name at purchase time
--   variant_price_cents: Price of the variant at purchase time
--   variant_currency: Currency code (e.g., 'USD')
--   variant_snapshot: Full JSONB snapshot of variant data at purchase time

-- Add variant columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variant_name TEXT,
ADD COLUMN IF NOT EXISTS variant_price_cents INTEGER,
ADD COLUMN IF NOT EXISTS variant_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS variant_snapshot JSONB;

-- Create index for faster lookups by variant
CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON orders(variant_id);

-- Add comments for documentation
COMMENT ON COLUMN orders.variant_id IS 'The product variant purchased (if applicable)';
COMMENT ON COLUMN orders.variant_name IS 'Snapshot of variant name at time of purchase';
COMMENT ON COLUMN orders.variant_price_cents IS 'Snapshot of variant price in cents at time of purchase';
COMMENT ON COLUMN orders.variant_currency IS 'Currency code for variant price (default: USD)';
COMMENT ON COLUMN orders.variant_snapshot IS 'Full JSONB snapshot of variant data at time of purchase (id, name, description, price_cents, etc.)';

-- Grant permissions
GRANT SELECT ON orders TO authenticated;
GRANT SELECT ON orders TO anon;

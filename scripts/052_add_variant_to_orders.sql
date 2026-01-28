-- Migration: Add variant_id and variant_name to orders table
-- This allows tracking which variant was purchased

-- Add variant columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON orders(variant_id);

-- Add comment for documentation
COMMENT ON COLUMN orders.variant_id IS 'The product variant purchased (if applicable)';
COMMENT ON COLUMN orders.variant_name IS 'Snapshot of variant name at time of purchase';

-- Grant permissions
GRANT SELECT ON orders TO authenticated;
GRANT SELECT ON orders TO anon;

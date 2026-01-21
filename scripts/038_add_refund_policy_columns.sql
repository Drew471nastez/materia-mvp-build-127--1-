-- Add refund policy columns to products table
-- Migration: 038_add_refund_policy_columns.sql

-- Add refund policy fields
ALTER TABLE products
ADD COLUMN IF NOT EXISTS refund_policy_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS refund_policy_type TEXT CHECK (refund_policy_type IN ('no_refunds', '7_day', '14_day', '30_day', '6_month')),
ADD COLUMN IF NOT EXISTS refund_policy_fine_print TEXT,
ADD COLUMN IF NOT EXISTS refund_policy_updated_at TIMESTAMPTZ;

-- Create index for products with refund policy enabled
CREATE INDEX IF NOT EXISTS idx_products_refund_policy ON products(refund_policy_enabled) WHERE refund_policy_enabled = true;

-- Add comment explaining the refund_policy_type values
COMMENT ON COLUMN products.refund_policy_type IS 'Refund policy options: no_refunds, 7_day, 14_day, 30_day, 6_month';

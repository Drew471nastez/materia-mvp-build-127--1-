-- Add missing columns to orders table for complete selling flow
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS buyer_first_name text,
ADD COLUMN IF NOT EXISTS buyer_last_name text,
ADD COLUMN IF NOT EXISTS buyer_city text,
ADD COLUMN IF NOT EXISTS buyer_country text,
ADD COLUMN IF NOT EXISTS fee_cents integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'stripe',
ADD COLUMN IF NOT EXISTS paypal_order_id text,
ADD COLUMN IF NOT EXISTS agreed_to_terms boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS agreed_at timestamptz DEFAULT now();

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  city text,
  country text,
  total_spent_cents integer DEFAULT 0,
  order_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(creator_id, email)
);

-- Enable RLS on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Creators can view their own customers
CREATE POLICY "Creators can view their own customers"
ON customers FOR SELECT
TO authenticated
USING (
  creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  )
);

-- System can insert/update customers
CREATE POLICY "System can manage customers"
ON customers FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_creator_id ON customers(creator_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(creator_id, email);
CREATE INDEX IF NOT EXISTS idx_orders_creator_lookup ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders(provider);

-- Add function to increment product sales count
CREATE OR REPLACE FUNCTION increment_product_sales(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET sales_count = COALESCE(sales_count, 0) + 1
  WHERE id = p_product_id;
END;
$$;

-- Add function to upsert customer and update stats
CREATE OR REPLACE FUNCTION upsert_customer(
  p_creator_id uuid,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_order_amount_cents integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  INSERT INTO customers (
    creator_id,
    email,
    first_name,
    last_name,
    city,
    country,
    total_spent_cents,
    order_count,
    updated_at
  )
  VALUES (
    p_creator_id,
    LOWER(TRIM(p_email)),
    p_first_name,
    p_last_name,
    p_city,
    p_country,
    p_order_amount_cents,
    1,
    now()
  )
  ON CONFLICT (creator_id, email)
  DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
    last_name = COALESCE(EXCLUDED.last_name, customers.last_name),
    city = COALESCE(EXCLUDED.city, customers.city),
    country = COALESCE(EXCLUDED.country, customers.country),
    total_spent_cents = customers.total_spent_cents + EXCLUDED.total_spent_cents,
    order_count = customers.order_count + 1,
    updated_at = now()
  RETURNING id INTO v_customer_id;
  
  RETURN v_customer_id;
END;
$$;

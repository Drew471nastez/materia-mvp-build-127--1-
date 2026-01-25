-- =====================================================
-- FIX ORDERS RLS POLICIES
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Drop existing problematic policies on orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Creators can view orders for their products" ON public.orders;
DROP POLICY IF EXISTS "System can insert orders" ON public.orders;

-- Step 2: Create improved RLS policies for orders

-- Policy 1: Buyers can view their own orders (by buyer_id or buyer_email)
CREATE POLICY "Buyers can view their own orders"
ON public.orders FOR SELECT
USING (
  auth.uid() = buyer_id
  OR
  buyer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy 2: Creators can view ALL orders for their products
-- This is the key fix - ensures creators can see all orders for products they own
CREATE POLICY "Creators can view orders for their products"
ON public.orders FOR SELECT
USING (
  product_id IN (
    SELECT p.id FROM public.products p
    INNER JOIN public.creators c ON p.creator_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Policy 3: Allow service role and authenticated users to insert orders
CREATE POLICY "Allow order creation"
ON public.orders FOR INSERT
WITH CHECK (true);

-- Policy 4: Allow creators to update orders (for refunds etc)
CREATE POLICY "Creators can update their product orders"
ON public.orders FOR UPDATE
USING (
  product_id IN (
    SELECT p.id FROM public.products p
    INNER JOIN public.creators c ON p.creator_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- Step 3: Ensure RLS is enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Step 4: Ensure necessary columns exist for guest orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_first_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_last_name TEXT;

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON public.orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Step 6: Grant permissions
GRANT SELECT ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.orders TO service_role;
GRANT ALL ON public.orders TO service_role;

-- =====================================================
-- DEBUG QUERIES - Run these to check your data
-- =====================================================

-- Check if orders exist (run this to see all orders)
-- SELECT * FROM public.orders LIMIT 10;

-- Check your creator ID
-- SELECT * FROM public.creators WHERE user_id = auth.uid();

-- Check products for your creator
-- SELECT * FROM public.products WHERE creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid());

-- Check orders for your products
-- SELECT o.* FROM public.orders o
-- WHERE o.product_id IN (
--   SELECT p.id FROM public.products p
--   INNER JOIN public.creators c ON p.creator_id = c.id
--   WHERE c.user_id = auth.uid()
-- );

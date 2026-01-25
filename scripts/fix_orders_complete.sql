-- =====================================================
-- COMPLETE ORDERS FIX - RUN ALL OF THIS IN SUPABASE SQL EDITOR
-- This fixes RLS policies and ensures orders display correctly
-- =====================================================

-- =====================================================
-- STEP 1: DROP ALL EXISTING ORDERS POLICIES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Creators can view orders for their products" ON public.orders;
DROP POLICY IF EXISTS "System can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation" ON public.orders;
DROP POLICY IF EXISTS "Creators can update their product orders" ON public.orders;
DROP POLICY IF EXISTS "Service role has full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;

-- =====================================================
-- STEP 2: ENSURE ALL REQUIRED COLUMNS EXIST
-- =====================================================
-- Make buyer_id nullable for guest checkout
ALTER TABLE public.orders ALTER COLUMN buyer_id DROP NOT NULL;

-- Add all required columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_first_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_last_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tip_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'stripe';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS session_fingerprint TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS transfer_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS allowed_fingerprints TEXT[] DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN DEFAULT true;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email_attempt_count INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_email_attempt_count INTEGER DEFAULT 0;

-- =====================================================
-- STEP 3: ENABLE RLS
-- =====================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 4: CREATE NEW RLS POLICIES
-- =====================================================

-- Policy 1: Buyers can view their own orders (by ID or email)
CREATE POLICY "Buyers can view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  buyer_id = auth.uid()
  OR
  buyer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy 2: CRITICAL - Creators can view ALL orders for their products
-- This is the main policy that allows sellers to see their orders
CREATE POLICY "Creators view product orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    INNER JOIN public.creators c ON c.id = p.creator_id
    WHERE p.id = orders.product_id
    AND c.user_id = auth.uid()
  )
);

-- Policy 3: Allow anyone to insert orders (for checkout)
CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- Policy 4: Creators can update their product orders (for refunds)
CREATE POLICY "Creators update product orders"
ON public.orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    INNER JOIN public.creators c ON c.id = p.creator_id
    WHERE p.id = orders.product_id
    AND c.user_id = auth.uid()
  )
);

-- Policy 5: Service role bypass (for webhooks and admin operations)
CREATE POLICY "Service role full access"
ON public.orders FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- STEP 5: CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON public.orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_receipt_token ON public.orders(receipt_token);

-- =====================================================
-- STEP 6: GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.orders TO anon;
GRANT INSERT ON public.orders TO anon;
GRANT ALL ON public.orders TO service_role;

-- Also ensure products and creators are accessible
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.creators TO authenticated;

-- =====================================================
-- STEP 7: VERIFY THE SETUP - RUN THESE TO DEBUG
-- =====================================================

-- Check total orders in database
SELECT 'Total orders in database:' as info, COUNT(*) as count FROM public.orders;

-- Check orders with status
SELECT status, COUNT(*) as count FROM public.orders GROUP BY status;

-- Check if your products exist
SELECT 'Your products:' as info;
SELECT id, title, creator_id FROM public.products
WHERE creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid())
LIMIT 10;

-- Check orders for your products (this should now work!)
SELECT 'Orders for your products:' as info;
SELECT
  o.id,
  o.buyer_email,
  o.buyer_first_name,
  o.buyer_last_name,
  o.amount_cents,
  o.status,
  o.created_at,
  p.title as product_title
FROM public.orders o
LEFT JOIN public.products p ON p.id = o.product_id
WHERE o.product_id IN (
  SELECT id FROM public.products
  WHERE creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid())
)
ORDER BY o.created_at DESC
LIMIT 20;

-- =====================================================
-- IF ORDERS STILL DON'T SHOW, RUN THIS DEBUG QUERY:
-- =====================================================
-- This will show ALL orders regardless of RLS (run as service role in SQL editor)
-- SELECT * FROM public.orders ORDER BY created_at DESC LIMIT 20;

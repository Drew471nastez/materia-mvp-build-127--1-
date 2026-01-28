-- =====================================================
-- COMPREHENSIVE ORDERS TABLE FIX FOR CHECKOUT
-- Run this in Supabase SQL Editor to fix "Failed to create order" errors
-- =====================================================

-- =====================================================
-- STEP 1: MAKE BUYER_ID NULLABLE (for guest checkout)
-- =====================================================
ALTER TABLE public.orders ALTER COLUMN buyer_id DROP NOT NULL;

-- =====================================================
-- STEP 2: ADD ALL REQUIRED COLUMNS
-- =====================================================

-- Buyer info columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_first_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_last_name TEXT;

-- Payment/order columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tip_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'stripe';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card';

-- Session/tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS session_fingerprint TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS allowed_fingerprints TEXT[] DEFAULT '{}';

-- Stripe columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS transfer_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_brand TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_last4 TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paypal_email TEXT;

-- Terms columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN DEFAULT true;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;

-- Email tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email_attempt_count INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_email_attempt_count INTEGER DEFAULT 0;

-- Device and geo info columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_country TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_country_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_device_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_os TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_browser TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_user_agent TEXT;

-- Variant columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_price_cents INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_currency TEXT DEFAULT 'USD';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_snapshot JSONB;

-- =====================================================
-- STEP 3: DROP ALL EXISTING RLS POLICIES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Creators can view orders for their products" ON public.orders;
DROP POLICY IF EXISTS "Creators view product orders" ON public.orders;
DROP POLICY IF EXISTS "System can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Creators can update their product orders" ON public.orders;
DROP POLICY IF EXISTS "Creators update product orders" ON public.orders;
DROP POLICY IF EXISTS "Service role has full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Service role full access" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;

-- =====================================================
-- STEP 4: ENABLE RLS
-- =====================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 5: CREATE NEW RLS POLICIES
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

-- Policy 2: Creators can view ALL orders for their products
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

-- Policy 3: CRITICAL - Allow ANYONE to insert orders (for checkout)
-- This allows both authenticated users AND anonymous guests to create orders
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
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_email ON public.orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_receipt_token ON public.orders(receipt_token);
CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON public.orders(variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_country_code ON public.orders(buyer_country_code);

-- =====================================================
-- STEP 7: GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON public.orders TO authenticated;
GRANT INSERT ON public.orders TO authenticated;
GRANT UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.orders TO anon;
GRANT INSERT ON public.orders TO anon;
GRANT ALL ON public.orders TO service_role;

-- Also ensure products and creators are accessible
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.creators TO authenticated;
GRANT SELECT ON public.creators TO anon;

-- =====================================================
-- VERIFICATION: Check columns exist
-- =====================================================
SELECT 'Orders table columns:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'orders'
ORDER BY ordinal_position;

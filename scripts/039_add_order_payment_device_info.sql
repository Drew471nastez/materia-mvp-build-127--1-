-- =====================================================
-- ADD PAYMENT METHOD AND DEVICE INFO TO ORDERS
-- This migration adds fields to track:
-- 1. Payment method details (card brand, last 4, PayPal email)
-- 2. Customer device info (country, device type, OS, browser)
-- =====================================================

-- =====================================================
-- STEP 1: ADD PAYMENT METHOD COLUMNS
-- =====================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_brand TEXT; -- visa, mastercard, amex, etc.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS card_last4 TEXT; -- last 4 digits
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paypal_email TEXT; -- if PayPal was used

-- =====================================================
-- STEP 2: ADD CUSTOMER LOCATION COLUMNS
-- =====================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_country TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_country_code TEXT; -- ISO country code (US, GB, etc.)

-- =====================================================
-- STEP 3: ADD DEVICE/BROWSER INFO COLUMNS
-- =====================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_device_type TEXT; -- desktop, mobile, tablet
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_os TEXT; -- Windows, macOS, iOS, Android, etc.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_browser TEXT; -- Chrome, Safari, Firefox, etc.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_user_agent TEXT; -- Full user agent string

-- =====================================================
-- STEP 4: CREATE INDEXES FOR NEW COLUMNS (OPTIONAL - for analytics)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_country_code ON public.orders(buyer_country_code);

-- =====================================================
-- VERIFY COLUMNS EXIST
-- =====================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'orders'
AND column_name IN (
  'payment_method', 'card_brand', 'card_last4', 'paypal_email',
  'buyer_country', 'buyer_country_code',
  'buyer_device_type', 'buyer_os', 'buyer_browser', 'buyer_user_agent'
)
ORDER BY column_name;

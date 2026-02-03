-- =====================================================
-- FIX CHECKOUT EMAIL DELIVERY - SIMPLIFIED
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Create email_logs table (skip if exists)
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INTEGER DEFAULT 1,
  error_message TEXT,
  provider TEXT DEFAULT 'mailgun',
  message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Add notification columns to orders (only if they don't exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_notified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_notified_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_email_last_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_email_last_error TEXT;

-- Step 3: Add columns to subscribers (only if they don't exist)
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct';
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_text TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_order ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_email ON subscribers(creator_id, email);

-- Step 5: Grant permissions
GRANT ALL ON email_logs TO service_role;
GRANT ALL ON email_logs TO authenticated;

-- Done!
SELECT 'Migration complete!' as status;

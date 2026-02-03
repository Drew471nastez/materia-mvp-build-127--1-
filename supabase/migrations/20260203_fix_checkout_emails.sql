-- =====================================================
-- FIX CHECKOUT EMAIL DELIVERY
-- Run this in Supabase SQL Editor
-- Date: 2026-02-03
-- =====================================================

-- =====================================================
-- STEP 1: Create email_logs table for email tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN ('buyer_download', 'seller_notification', 'receipt_resend', 'lead_magnet', 'welcome', 'flow')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  attempt INTEGER DEFAULT 1,
  error_message TEXT,
  provider TEXT DEFAULT 'mailgun',
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_logs
CREATE INDEX IF NOT EXISTS idx_email_logs_order ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);

-- Unique constraint to prevent duplicate successful sends
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_unique_sent
ON email_logs(order_id, email_type)
WHERE status = 'sent';

-- =====================================================
-- STEP 2: Add email status columns to orders table
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_email_sent') THEN
    ALTER TABLE orders ADD COLUMN buyer_email_sent BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'seller_email_sent') THEN
    ALTER TABLE orders ADD COLUMN seller_email_sent BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_email_error') THEN
    ALTER TABLE orders ADD COLUMN buyer_email_error TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'seller_email_error') THEN
    ALTER TABLE orders ADD COLUMN seller_email_error TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_email_attempt_count') THEN
    ALTER TABLE orders ADD COLUMN buyer_email_attempt_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'seller_email_attempt_count') THEN
    ALTER TABLE orders ADD COLUMN seller_email_attempt_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- STEP 3: Ensure subscribers table has all needed columns
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'source') THEN
    ALTER TABLE subscribers ADD COLUMN source TEXT DEFAULT 'direct';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'source_id') THEN
    ALTER TABLE subscribers ADD COLUMN source_id UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'is_active') THEN
    ALTER TABLE subscribers ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'consent_text') THEN
    ALTER TABLE subscribers ADD COLUMN consent_text TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'consent_timestamp') THEN
    ALTER TABLE subscribers ADD COLUMN consent_timestamp TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'unsubscribe_token') THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribe_token UUID DEFAULT gen_random_uuid();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'unsubscribed_at') THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Generate unsubscribe tokens for existing subscribers
UPDATE subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

-- Index for subscriber lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_email ON subscribers(creator_id, email);
CREATE INDEX IF NOT EXISTS idx_subscribers_source ON subscribers(source);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);

-- =====================================================
-- STEP 4: Grant permissions
-- =====================================================
GRANT ALL ON email_logs TO service_role;
GRANT SELECT ON email_logs TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'email_logs' as table_name, COUNT(*) as rows FROM email_logs
UNION ALL
SELECT 'subscribers', COUNT(*) FROM subscribers
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;

-- =====================================================
-- COMPLETE REBUILD: EMAIL SENT SYSTEM
-- Run this in Supabase SQL Editor to fix all issues
-- Date: 2026-02-03
-- =====================================================

-- =====================================================
-- STEP 1: DROP AND RECREATE email_events TABLE
-- This is the single source of truth for all tracking
-- =====================================================

-- Backup existing events if any (optional - comment out if not needed)
-- CREATE TABLE IF NOT EXISTS email_events_backup AS SELECT * FROM email_events;

-- Drop existing email_events table and recreate cleanly
DROP TABLE IF EXISTS email_events CASCADE;

CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email TEXT NOT NULL, -- Single column for recipient email (no duplicate columns)
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'complained')),
  url TEXT, -- For click events - the URL that was clicked
  user_agent TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimized indexes for common queries
CREATE INDEX idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX idx_email_events_creator ON email_events(creator_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_email ON email_events(email);
CREATE INDEX idx_email_events_created ON email_events(created_at DESC);
CREATE INDEX idx_email_events_campaign_type ON email_events(campaign_id, event_type);
CREATE INDEX idx_email_events_creator_type_created ON email_events(creator_id, event_type, created_at DESC);

-- DISABLE RLS - tracking must work without auth (open/click pixels have no session)
ALTER TABLE email_events DISABLE ROW LEVEL SECURITY;

-- Grant service role full access
GRANT ALL ON email_events TO service_role;
GRANT ALL ON email_events TO anon; -- Needed for tracking pixels

-- =====================================================
-- STEP 2: ENSURE email_campaigns TABLE IS CORRECT
-- =====================================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Ensure audience_count exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_campaigns' AND column_name = 'audience_count'
  ) THEN
    ALTER TABLE email_campaigns ADD COLUMN audience_count INTEGER DEFAULT 0;
  END IF;

  -- Ensure preview_text exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_campaigns' AND column_name = 'preview_text'
  ) THEN
    ALTER TABLE email_campaigns ADD COLUMN preview_text TEXT;
  END IF;

  -- Ensure from_name exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_campaigns' AND column_name = 'from_name'
  ) THEN
    ALTER TABLE email_campaigns ADD COLUMN from_name TEXT;
  END IF;

  -- Ensure reply_to exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_campaigns' AND column_name = 'reply_to'
  ) THEN
    ALTER TABLE email_campaigns ADD COLUMN reply_to TEXT;
  END IF;
END $$;

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator ON email_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator_status_sent ON email_campaigns(creator_id, status, sent_at DESC);

-- =====================================================
-- STEP 3: ENSURE email_sends TABLE IS CORRECT
-- This tracks individual send attempts per recipient
-- =====================================================

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_sends' AND column_name = 'opened_at'
  ) THEN
    ALTER TABLE email_sends ADD COLUMN opened_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_sends' AND column_name = 'clicked_at'
  ) THEN
    ALTER TABLE email_sends ADD COLUMN clicked_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_sends' AND column_name = 'email'
  ) THEN
    ALTER TABLE email_sends ADD COLUMN email TEXT;
  END IF;
END $$;

-- Ensure proper indexes
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_email ON email_sends(email);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);
CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends(sent_at DESC);

-- =====================================================
-- STEP 4: ENSURE subscribers TABLE HAS REQUIRED COLUMNS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'unsubscribe_token'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribe_token UUID DEFAULT gen_random_uuid();
    CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'unsubscribed_at'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Generate tokens for any subscribers missing them
UPDATE subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

-- =====================================================
-- STEP 5: DROP email_recipients TABLE (redundant)
-- We use email_sends + email_events, no need for email_recipients
-- =====================================================

DROP TABLE IF EXISTS email_recipients CASCADE;

-- =====================================================
-- STEP 6: CREATE HELPER FUNCTIONS FOR STATS
-- =====================================================

-- Function to get campaign stats efficiently
CREATE OR REPLACE FUNCTION get_campaign_stats(p_campaign_id UUID)
RETURNS TABLE (
  total_sent BIGINT,
  unique_opens BIGINT,
  unique_clicks BIGINT,
  bounced BIGINT,
  unsubscribed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM email_sends WHERE campaign_id = p_campaign_id AND status = 'sent')::BIGINT as total_sent,
    (SELECT COUNT(DISTINCT email) FROM email_events WHERE campaign_id = p_campaign_id AND event_type = 'opened')::BIGINT as unique_opens,
    (SELECT COUNT(DISTINCT email) FROM email_events WHERE campaign_id = p_campaign_id AND event_type = 'clicked')::BIGINT as unique_clicks,
    (SELECT COUNT(*) FROM email_events WHERE campaign_id = p_campaign_id AND event_type = 'bounced')::BIGINT as bounced,
    (SELECT COUNT(*) FROM email_events WHERE campaign_id = p_campaign_id AND event_type = 'unsubscribed')::BIGINT as unsubscribed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get creator stats for a time range
CREATE OR REPLACE FUNCTION get_creator_email_stats(
  p_creator_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_sent BIGINT,
  total_opens BIGINT,
  total_clicks BIGINT,
  total_unsubscribed BIGINT,
  campaigns_in_range BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH campaigns_in_range AS (
    SELECT id, audience_count
    FROM email_campaigns
    WHERE creator_id = p_creator_id
      AND status = 'sent'
      AND (p_start_date IS NULL OR sent_at >= p_start_date)
      AND sent_at <= p_end_date
  ),
  events_in_range AS (
    SELECT event_type, email, campaign_id
    FROM email_events
    WHERE creator_id = p_creator_id
      AND campaign_id IN (SELECT id FROM campaigns_in_range)
  )
  SELECT
    COALESCE(SUM(c.audience_count), 0)::BIGINT as total_sent,
    (SELECT COUNT(DISTINCT email) FROM events_in_range WHERE event_type = 'opened')::BIGINT as total_opens,
    (SELECT COUNT(DISTINCT email) FROM events_in_range WHERE event_type = 'clicked')::BIGINT as total_clicks,
    (SELECT COUNT(*) FROM events_in_range WHERE event_type = 'unsubscribed')::BIGINT as total_unsubscribed,
    COUNT(c.id)::BIGINT as campaigns_in_range
  FROM campaigns_in_range c;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly email usage
CREATE OR REPLACE FUNCTION get_monthly_email_usage(p_creator_id UUID)
RETURNS TABLE (
  sent_this_month BIGINT,
  monthly_limit INTEGER
) AS $$
DECLARE
  start_of_month TIMESTAMPTZ;
BEGIN
  start_of_month := date_trunc('month', NOW());

  RETURN QUERY
  SELECT
    COALESCE(SUM(audience_count), 0)::BIGINT as sent_this_month,
    3000 as monthly_limit -- TODO: Get from user's plan
  FROM email_campaigns
  WHERE creator_id = p_creator_id
    AND status = 'sent'
    AND sent_at >= start_of_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_campaign_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_creator_email_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_creator_email_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_email_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_email_usage(UUID) TO service_role;

-- =====================================================
-- STEP 7: VERIFY SETUP
-- =====================================================

-- Show table structure
SELECT
  'email_events' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'email_events'
ORDER BY ordinal_position;

-- Show indexes
SELECT
  indexname,
  tablename
FROM pg_indexes
WHERE tablename IN ('email_events', 'email_campaigns', 'email_sends')
ORDER BY tablename, indexname;

-- Show row counts
SELECT 'email_campaigns' as table_name, COUNT(*) as row_count FROM email_campaigns
UNION ALL
SELECT 'email_sends', COUNT(*) FROM email_sends
UNION ALL
SELECT 'email_events', COUNT(*) FROM email_events
UNION ALL
SELECT 'subscribers', COUNT(*) FROM subscribers;

-- =====================================================
-- MIGRATION COMPLETE!
-- Run the API endpoints next to verify everything works
-- =====================================================

-- ============================================================================
-- STORELIB EMAIL SYSTEM - COMPLETE REBUILD
-- Copy and paste this entire script into Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP OLD POLICIES (to avoid conflicts)
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own campaigns" ON email_campaigns;
DROP POLICY IF EXISTS "Service role can manage all sends" ON email_sends;
DROP POLICY IF EXISTS "Users can manage their own flows" ON email_flows;
DROP POLICY IF EXISTS "Users can manage their own scheduled emails" ON scheduled_flow_emails;

-- ============================================================================
-- STEP 2: CREATE/UPDATE email_campaigns TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  preview_text TEXT,
  from_name TEXT,
  reply_to TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  audience_type TEXT DEFAULT 'all',
  segment_id UUID,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  audience_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'audience_count') THEN
    ALTER TABLE email_campaigns ADD COLUMN audience_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'sent_at') THEN
    ALTER TABLE email_campaigns ADD COLUMN sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator ON email_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);

-- RLS
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_manage_campaigns" ON email_campaigns
  FOR ALL USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

GRANT ALL ON email_campaigns TO authenticated;
GRANT ALL ON email_campaigns TO service_role;

-- ============================================================================
-- STEP 3: CREATE/UPDATE email_recipients TABLE (tracks individual sends)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_recipients
CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign ON email_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_creator ON email_recipients(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_email ON email_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status ON email_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_recipients_sent_at ON email_recipients(sent_at DESC);

-- RLS - disable for service role access (tracking endpoints need to work without auth)
ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_view_recipients" ON email_recipients
  FOR SELECT USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_recipients" ON email_recipients
  FOR ALL TO service_role USING (true);

GRANT ALL ON email_recipients TO service_role;
GRANT SELECT ON email_recipients TO authenticated;

-- ============================================================================
-- STEP 4: CREATE/UPDATE email_events TABLE (tracks opens, clicks, unsubs)
-- ============================================================================

-- First, add missing columns to email_events if table exists
DO $$
BEGIN
  -- Add recipient_id column if it doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_events') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'recipient_id') THEN
      ALTER TABLE email_events ADD COLUMN recipient_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'creator_id') THEN
      ALTER TABLE email_events ADD COLUMN creator_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'url') THEN
      ALTER TABLE email_events ADD COLUMN url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'user_agent') THEN
      ALTER TABLE email_events ADD COLUMN user_agent TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'ip_address') THEN
      ALTER TABLE email_events ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'metadata') THEN
      ALTER TABLE email_events ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
  END IF;
END $$;

-- Create table if it doesn't exist (for fresh installs)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID,
  creator_id UUID,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_events (only create if column exists)
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email);

-- Create recipient_id index only if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'recipient_id') THEN
    CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(recipient_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_events' AND column_name = 'creator_id') THEN
    CREATE INDEX IF NOT EXISTS idx_email_events_creator ON email_events(creator_id);
  END IF;
END $$;

-- RLS - disable for tracking (endpoints work without auth)
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_view_events" ON email_events
  FOR SELECT USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "service_role_all_events" ON email_events
  FOR ALL TO service_role USING (true);

GRANT ALL ON email_events TO service_role;
GRANT SELECT ON email_events TO authenticated;

-- ============================================================================
-- STEP 5: ENSURE subscribers TABLE HAS REQUIRED COLUMNS
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'unsubscribe_token') THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribe_token UUID DEFAULT gen_random_uuid();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'unsubscribed_at') THEN
    ALTER TABLE subscribers ADD COLUMN unsubscribed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscribers' AND column_name = 'is_active') THEN
    ALTER TABLE subscribers ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Ensure all subscribers have unsubscribe tokens
UPDATE subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_status ON subscribers(creator_id, status);

-- ============================================================================
-- STEP 6: CREATE HELPER FUNCTIONS FOR STATS
-- ============================================================================

-- Function to get campaign stats for a creator
CREATE OR REPLACE FUNCTION get_email_stats(
  p_creator_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_sent BIGINT,
  total_delivered BIGINT,
  total_opened BIGINT,
  total_clicked BIGINT,
  total_unsubscribed BIGINT,
  total_bounced BIGINT,
  unique_opens BIGINT,
  unique_clicks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('sent', 'delivered'))::BIGINT as total_sent,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'delivered')::BIGINT as total_delivered,
    COALESCE(SUM(r.open_count), 0)::BIGINT as total_opened,
    COALESCE(SUM(r.click_count), 0)::BIGINT as total_clicked,
    (SELECT COUNT(DISTINCT ee.id) FROM email_events ee
     WHERE ee.creator_id = p_creator_id
     AND ee.event_type = 'unsubscribed'
     AND (p_start_date IS NULL OR ee.created_at >= p_start_date)
     AND (p_end_date IS NULL OR ee.created_at <= p_end_date))::BIGINT as total_unsubscribed,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'bounced')::BIGINT as total_bounced,
    COUNT(DISTINCT r.id) FILTER (WHERE r.opened_at IS NOT NULL)::BIGINT as unique_opens,
    COUNT(DISTINCT r.id) FILTER (WHERE r.clicked_at IS NOT NULL)::BIGINT as unique_clicks
  FROM email_recipients r
  WHERE r.creator_id = p_creator_id
    AND (p_start_date IS NULL OR r.sent_at >= p_start_date)
    AND (p_end_date IS NULL OR r.sent_at <= p_end_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get monthly email count
CREATE OR REPLACE FUNCTION get_monthly_email_count(p_creator_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)::BIGINT INTO v_count
  FROM email_recipients
  WHERE creator_id = p_creator_id
    AND sent_at >= date_trunc('month', NOW())
    AND status IN ('sent', 'delivered');
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_email_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_email_stats TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_email_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_email_count TO service_role;

-- ============================================================================
-- STEP 7: MIGRATE OLD DATA (if email_sends table exists)
-- ============================================================================
DO $$
BEGIN
  -- Check if email_sends exists and has data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_sends') THEN
    -- Migrate data from email_sends to email_recipients (if not already migrated)
    INSERT INTO email_recipients (id, campaign_id, creator_id, subscriber_id, email, status, sent_at, provider_message_id, error_message, created_at)
    SELECT
      es.id,
      es.campaign_id,
      ec.creator_id,
      es.subscriber_id,
      es.email,
      es.status,
      es.sent_at,
      es.resend_id,
      es.error_message,
      es.created_at
    FROM email_sends es
    JOIN email_campaigns ec ON ec.id = es.campaign_id
    WHERE NOT EXISTS (SELECT 1 FROM email_recipients WHERE id = es.id)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Migrated data from email_sends to email_recipients';
  END IF;
END $$;

-- ============================================================================
-- STEP 8: VERIFY SETUP
-- ============================================================================
SELECT 'email_campaigns' as table_name, COUNT(*) as row_count FROM email_campaigns
UNION ALL
SELECT 'email_recipients', COUNT(*) FROM email_recipients
UNION ALL
SELECT 'email_events', COUNT(*) FROM email_events
UNION ALL
SELECT 'subscribers', COUNT(*) FROM subscribers;

-- Show recent campaigns
SELECT id, subject, status, audience_count, sent_at, created_at
FROM email_campaigns
ORDER BY created_at DESC
LIMIT 5;

-- =====================================================
-- COMPLETE EMAIL SYSTEM DATABASE SETUP
-- Run this entire script in your Supabase SQL Editor
-- =====================================================

-- =====================================================
-- 1. EMAIL CAMPAIGNS TABLE (main table for email campaigns)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  preview_text TEXT,
  from_name TEXT,
  reply_to TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'failed'
  audience_type TEXT DEFAULT 'all',
  segment_id UUID,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  audience_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator ON email_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at);

-- RLS for email_campaigns - ALLOW users to see and manage their own campaigns
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own campaigns" ON email_campaigns;
CREATE POLICY "Users can manage their own campaigns" ON email_campaigns
  FOR ALL
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Grant service role full access
GRANT ALL ON email_campaigns TO service_role;

-- =====================================================
-- 2. EMAIL SENDS TABLE (individual send records)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  resend_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_sends
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_subscriber ON email_sends(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_email ON email_sends(email);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);

-- RLS for email_sends
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage all sends" ON email_sends;
CREATE POLICY "Service role can manage all sends" ON email_sends
  FOR ALL
  TO service_role
  USING (true);

-- Grant service role full access
GRANT ALL ON email_sends TO service_role;

-- =====================================================
-- 3. EMAIL EVENTS TABLE (tracking opens, clicks, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  flow_id UUID,
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_events
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_creator ON email_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON email_events(created_at);

-- NO RLS on email_events - service role only (tracking must work without auth)
ALTER TABLE email_events DISABLE ROW LEVEL SECURITY;

-- Grant service role full access
GRANT ALL ON email_events TO service_role;

-- =====================================================
-- 4. EMAIL FLOWS TABLE (automation flows)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Flow',
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'purchase',
  trigger_config JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  steps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_flows_creator ON email_flows(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_flows_trigger ON email_flows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_flows_status ON email_flows(status);

-- RLS for email_flows
ALTER TABLE email_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own flows" ON email_flows;
CREATE POLICY "Users can manage their own flows" ON email_flows
  FOR ALL
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

GRANT ALL ON email_flows TO service_role;

-- =====================================================
-- 5. SCHEDULED FLOW EMAILS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS scheduled_flow_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  order_id UUID,
  product_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_flow ON scheduled_flow_emails(flow_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_creator ON scheduled_flow_emails(creator_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_flow_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled ON scheduled_flow_emails(scheduled_for);

-- RLS
ALTER TABLE scheduled_flow_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own scheduled emails" ON scheduled_flow_emails;
CREATE POLICY "Users can manage their own scheduled emails" ON scheduled_flow_emails
  FOR ALL
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

GRANT ALL ON scheduled_flow_emails TO service_role;

-- =====================================================
-- 6. ADD creator_id TO email_events IF NOT EXISTS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_events' AND column_name = 'creator_id'
  ) THEN
    ALTER TABLE email_events ADD COLUMN creator_id UUID REFERENCES creators(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_email_events_creator ON email_events(creator_id);
  END IF;
END $$;

-- =====================================================
-- 7. ENSURE subscribers TABLE HAS unsubscribe_token
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

-- Generate unsubscribe tokens for existing subscribers without one
UPDATE subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

-- =====================================================
-- 8. VERIFY ALL TABLES EXIST - Show table info
-- =====================================================
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('email_campaigns', 'email_sends', 'email_events', 'email_flows', 'scheduled_flow_emails', 'subscribers')
ORDER BY table_name;

-- =====================================================
-- 9. SHOW SAMPLE DATA (for debugging)
-- =====================================================
SELECT 'email_campaigns' as table_name, COUNT(*) as row_count FROM email_campaigns
UNION ALL
SELECT 'email_sends', COUNT(*) FROM email_sends
UNION ALL
SELECT 'email_events', COUNT(*) FROM email_events
UNION ALL
SELECT 'email_flows', COUNT(*) FROM email_flows
UNION ALL
SELECT 'subscribers', COUNT(*) FROM subscribers;

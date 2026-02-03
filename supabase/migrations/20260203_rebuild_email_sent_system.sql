-- =====================================================
-- COMPLETE EMAIL SYSTEM REBUILD
-- Run this in Supabase SQL Editor
-- Date: 2026-02-03
-- =====================================================

-- =====================================================
-- STEP 1: email_campaigns TABLE - Add missing columns
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'audience_count') THEN
    ALTER TABLE email_campaigns ADD COLUMN audience_count INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'preview_text') THEN
    ALTER TABLE email_campaigns ADD COLUMN preview_text TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'from_name') THEN
    ALTER TABLE email_campaigns ADD COLUMN from_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_campaigns' AND column_name = 'reply_to') THEN
    ALTER TABLE email_campaigns ADD COLUMN reply_to TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator ON email_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator_status ON email_campaigns(creator_id, status);

-- =====================================================
-- STEP 2: campaign_recipients TABLE (source of truth for sends)
-- =====================================================
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  tracking_token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_creator ON campaign_recipients(creator_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_token ON campaign_recipients(tracking_token);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_sent_at ON campaign_recipients(sent_at DESC);

-- Unique constraint to prevent duplicate sends
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_campaign_recipients_unique') THEN
    CREATE UNIQUE INDEX idx_campaign_recipients_unique ON campaign_recipients(campaign_id, email);
  END IF;
END $$;

-- =====================================================
-- STEP 3: email_events TABLE (tracking events)
-- =====================================================
DROP TABLE IF EXISTS email_events CASCADE;

CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'complained')),
  url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX idx_email_events_recipient ON email_events(recipient_id);
CREATE INDEX idx_email_events_creator ON email_events(creator_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_email ON email_events(email);
CREATE INDEX idx_email_events_created ON email_events(created_at DESC);
CREATE INDEX idx_email_events_campaign_type ON email_events(campaign_id, event_type);

-- Unique constraint for opens (one open event per recipient per campaign)
CREATE UNIQUE INDEX idx_email_events_unique_open ON email_events(campaign_id, email, event_type) WHERE event_type = 'opened';

-- DISABLE RLS for tracking (pixels have no auth)
ALTER TABLE email_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 4: subscribers TABLE updates
-- =====================================================
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

UPDATE subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_status ON subscribers(creator_id, status);

-- =====================================================
-- STEP 5: Grant permissions
-- =====================================================
GRANT ALL ON email_events TO service_role;
GRANT ALL ON email_events TO anon;
GRANT ALL ON campaign_recipients TO service_role;
GRANT ALL ON campaign_recipients TO anon;

-- =====================================================
-- STEP 6: Migrate data from email_sends if exists
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_sends') THEN
    INSERT INTO campaign_recipients (campaign_id, creator_id, subscriber_id, email, status, sent_at, opened_at, clicked_at, created_at)
    SELECT
      es.campaign_id,
      ec.creator_id,
      es.subscriber_id,
      COALESCE(es.email, s.email),
      CASE
        WHEN es.status = 'sent' THEN 'sent'
        WHEN es.status = 'failed' THEN 'failed'
        WHEN es.status = 'bounced' THEN 'bounced'
        ELSE 'sent'
      END,
      es.sent_at,
      es.opened_at,
      es.clicked_at,
      es.created_at
    FROM email_sends es
    JOIN email_campaigns ec ON es.campaign_id = ec.id
    LEFT JOIN subscribers s ON es.subscriber_id = s.id
    WHERE es.campaign_id IS NOT NULL
      AND COALESCE(es.email, s.email) IS NOT NULL
    ON CONFLICT (campaign_id, email) DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'campaign_recipients' as table_name, COUNT(*) as rows FROM campaign_recipients
UNION ALL
SELECT 'email_events', COUNT(*) FROM email_events
UNION ALL
SELECT 'email_campaigns', COUNT(*) FROM email_campaigns
UNION ALL
SELECT 'subscribers', COUNT(*) FROM subscribers;

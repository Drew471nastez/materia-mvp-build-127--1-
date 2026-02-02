-- Email Flows System - Full SQL Migration
-- This migration creates all tables needed for the email automation flows to work

-- =====================================================
-- 1. EMAIL FLOWS TABLE (main table for storing flows)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Flow',
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'purchase', -- 'purchase', 'new_subscriber', 'tag_added', 'manual'
  trigger_config JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused'
  steps JSONB DEFAULT '[]', -- Array of flow steps with email content
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by creator and trigger type
CREATE INDEX IF NOT EXISTS idx_email_flows_creator_id ON email_flows(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_flows_trigger_type ON email_flows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_flows_status ON email_flows(status);
CREATE INDEX IF NOT EXISTS idx_email_flows_active_trigger ON email_flows(creator_id, trigger_type, status) WHERE status = 'active';

-- RLS for email_flows
ALTER TABLE email_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own flows" ON email_flows;
CREATE POLICY "Users can manage their own flows" ON email_flows
  FOR ALL
  USING (
    creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 2. SCHEDULED FLOW EMAILS TABLE (for delayed/scheduled emails)
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
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for scheduled_flow_emails
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_flow_id ON scheduled_flow_emails(flow_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_creator_id ON scheduled_flow_emails(creator_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_status ON scheduled_flow_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_scheduled_for ON scheduled_flow_emails(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_pending ON scheduled_flow_emails(status, scheduled_for) WHERE status = 'pending';

-- RLS for scheduled_flow_emails
ALTER TABLE scheduled_flow_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own scheduled emails" ON scheduled_flow_emails;
CREATE POLICY "Users can manage their own scheduled emails" ON scheduled_flow_emails
  FOR ALL
  USING (
    creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 3. EMAIL EVENTS TABLE (for tracking email analytics)
-- =====================================================
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_events
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_flow_id ON email_events(flow_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);

-- No RLS on email_events since it's internal tracking

-- =====================================================
-- 4. FLOW EXECUTION LOG TABLE (for debugging/analytics)
-- =====================================================
CREATE TABLE IF NOT EXISTS flow_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'triggered', -- 'triggered', 'processing', 'completed', 'failed'
  emails_sent INTEGER DEFAULT 0,
  emails_scheduled INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for flow_execution_log
CREATE INDEX IF NOT EXISTS idx_flow_execution_log_flow_id ON flow_execution_log(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_execution_log_status ON flow_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_flow_execution_log_created_at ON flow_execution_log(created_at);

-- =====================================================
-- 5. FUNCTION TO PROCESS SCHEDULED EMAILS
-- This function can be called by a cron job or edge function
-- =====================================================
CREATE OR REPLACE FUNCTION process_scheduled_flow_emails()
RETURNS TABLE (
  processed_count INTEGER,
  error_count INTEGER
) AS $$
DECLARE
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_email RECORD;
BEGIN
  -- Find all pending emails that are due
  FOR v_email IN
    SELECT id, flow_id, recipient_email, subject
    FROM scheduled_flow_emails
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 50 -- Process in batches
  LOOP
    -- Mark as processing (will be picked up by external process)
    UPDATE scheduled_flow_emails
    SET status = 'processing', updated_at = NOW()
    WHERE id = v_email.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. UPDATE TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to email_flows
DROP TRIGGER IF EXISTS update_email_flows_updated_at ON email_flows;
CREATE TRIGGER update_email_flows_updated_at
  BEFORE UPDATE ON email_flows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to scheduled_flow_emails
DROP TRIGGER IF EXISTS update_scheduled_flow_emails_updated_at ON scheduled_flow_emails;
CREATE TRIGGER update_scheduled_flow_emails_updated_at
  BEFORE UPDATE ON scheduled_flow_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. GRANT PERMISSIONS (for service role)
-- =====================================================
GRANT ALL ON email_flows TO service_role;
GRANT ALL ON scheduled_flow_emails TO service_role;
GRANT ALL ON email_events TO service_role;
GRANT ALL ON flow_execution_log TO service_role;

-- =====================================================
-- 8. SAMPLE DATA / COMMENTS
-- =====================================================
COMMENT ON TABLE email_flows IS 'Stores email automation flows with their configuration and steps';
COMMENT ON TABLE scheduled_flow_emails IS 'Queue for delayed/scheduled flow emails to be sent';
COMMENT ON TABLE email_events IS 'Tracks all email events (sent, opened, clicked, etc.) for analytics';
COMMENT ON TABLE flow_execution_log IS 'Logs flow execution for debugging and analytics';

COMMENT ON COLUMN email_flows.steps IS 'JSON array of flow steps. Each step has: id, type (email/delay), order, config (subject, body, delay_value, delay_unit)';
COMMENT ON COLUMN email_flows.trigger_type IS 'When to trigger this flow: purchase, new_subscriber, tag_added, manual';
COMMENT ON COLUMN scheduled_flow_emails.scheduled_for IS 'When this email should be sent (UTC timestamp)';

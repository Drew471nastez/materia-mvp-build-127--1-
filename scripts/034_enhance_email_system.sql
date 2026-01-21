-- Enhance subscribers table with additional fields
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'complained'));
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_text TEXT DEFAULT 'I agree to receive email updates';
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ DEFAULT NOW();

-- Add index for unsubscribe token lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Create email_segments table for dynamic audience filtering
CREATE TABLE IF NOT EXISTS email_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}', -- Dynamic filter conditions
  -- Example filters: {"source": "onepage", "status": "subscribed", "tags": ["vip"]}
  subscriber_count INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for email_segments
CREATE INDEX IF NOT EXISTS idx_email_segments_creator_id ON email_segments(creator_id);

-- Add segment_id to email_campaigns for targeting specific segments
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES email_segments(id) ON DELETE SET NULL;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS reply_to TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'default';

-- Create email_events table for detailed analytics tracking
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  send_id UUID REFERENCES email_sends(id) ON DELETE SET NULL,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  event_data JSONB DEFAULT '{}', -- Additional data like link URL for clicks, bounce reason, etc.
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for email_events
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_send_id ON email_events(send_id);
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber_id ON email_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);

-- Create email_templates table for reusable templates
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE, -- NULL for system templates
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'custom' CHECK (template_type IN ('system', 'custom')),
  is_default BOOLEAN DEFAULT FALSE,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_creator_id ON email_templates(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);

-- Enable RLS on new tables
ALTER TABLE email_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Creators can view their own segments" ON email_segments;
DROP POLICY IF EXISTS "Creators can insert their own segments" ON email_segments;
DROP POLICY IF EXISTS "Creators can update their own segments" ON email_segments;
DROP POLICY IF EXISTS "Creators can delete their own segments" ON email_segments;
DROP POLICY IF EXISTS "Creators can view their own events" ON email_events;
DROP POLICY IF EXISTS "Anyone can insert events via tracking" ON email_events;
DROP POLICY IF EXISTS "Creators can view their own templates" ON email_templates;
DROP POLICY IF EXISTS "Creators can view system templates" ON email_templates;
DROP POLICY IF EXISTS "Creators can insert their own templates" ON email_templates;
DROP POLICY IF EXISTS "Creators can update their own templates" ON email_templates;
DROP POLICY IF EXISTS "Creators can delete their own templates" ON email_templates;

-- RLS policies for email_segments
CREATE POLICY "Creators can view their own segments"
  ON email_segments FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can insert their own segments"
  ON email_segments FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own segments"
  ON email_segments FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own segments"
  ON email_segments FOR DELETE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- RLS policies for email_events
CREATE POLICY "Creators can view their own events"
  ON email_events FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM email_campaigns WHERE creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  ));

-- Allow public insert for tracking pixel/webhook events
CREATE POLICY "Anyone can insert events via tracking"
  ON email_events FOR INSERT
  WITH CHECK (true);

-- RLS policies for email_templates
CREATE POLICY "Creators can view their own templates"
  ON email_templates FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()) OR template_type = 'system');

CREATE POLICY "Creators can view system templates"
  ON email_templates FOR SELECT
  USING (template_type = 'system');

CREATE POLICY "Creators can insert their own templates"
  ON email_templates FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own templates"
  ON email_templates FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own templates"
  ON email_templates FOR DELETE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS email_segments_updated_at ON email_segments;
DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;

-- Create update triggers for new tables
CREATE OR REPLACE FUNCTION update_email_segments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_segments_updated_at
  BEFORE UPDATE ON email_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_email_segments_updated_at();

CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_templates_updated_at();

-- Insert default system templates
INSERT INTO email_templates (id, creator_id, name, description, body_template, template_type, is_default)
VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Simple', 'Clean and minimal email template',
   E'<div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">\n  <div style="text-align: center; margin-bottom: 30px;">\n    {{#if logo_url}}<img src="{{logo_url}}" alt="{{sender_name}}" style="max-height: 50px; margin-bottom: 20px;" />{{/if}}\n  </div>\n  <div style="color: #333; line-height: 1.6;">\n    {{content}}\n  </div>\n  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">\n    <p>You received this email because you subscribed to {{sender_name}}.</p>\n    <p><a href="{{unsubscribe_url}}" style="color: #999;">Unsubscribe</a></p>\n  </div>\n</div>',
   'system', true)
ON CONFLICT (id) DO NOTHING;

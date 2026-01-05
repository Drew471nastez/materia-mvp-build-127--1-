-- Create subscribers table to collect emails from OnePage and Store Builder
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('onepage', 'store_builder')),
  source_id UUID, -- Optional: onepage_id or store_builder_config_id
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(creator_id, email)
);

-- Create email_campaigns table for email broadcasts
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  preview_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  audience_type TEXT NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all', 'subscribers', 'customers', 'onepage', 'store_builder')),
  audience_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email_sends table to track individual email sends
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES subscribers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked')),
  resend_id TEXT, -- ID from Resend API
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_id ON subscribers(creator_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_source ON subscribers(source);
CREATE INDEX IF NOT EXISTS idx_subscribers_is_active ON subscribers(is_active);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator_id ON email_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign_id ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_subscriber_id ON email_sends(subscriber_id);

-- Enable RLS
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscribers
CREATE POLICY "Creators can view their own subscribers"
  ON subscribers FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can insert their own subscribers"
  ON subscribers FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own subscribers"
  ON subscribers FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own subscribers"
  ON subscribers FOR DELETE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Allow public insert for subscribe modal (anonymous users can subscribe)
CREATE POLICY "Anyone can subscribe via public forms"
  ON subscribers FOR INSERT
  WITH CHECK (true);

-- RLS policies for email_campaigns
CREATE POLICY "Creators can view their own campaigns"
  ON email_campaigns FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can insert their own campaigns"
  ON email_campaigns FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own campaigns"
  ON email_campaigns FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own campaigns"
  ON email_campaigns FOR DELETE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- RLS policies for email_sends
CREATE POLICY "Creators can view their own email sends"
  ON email_sends FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM email_campaigns WHERE creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_subscribers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscribers_updated_at
  BEFORE UPDATE ON subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_subscribers_updated_at();

CREATE OR REPLACE FUNCTION update_email_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_email_campaigns_updated_at();

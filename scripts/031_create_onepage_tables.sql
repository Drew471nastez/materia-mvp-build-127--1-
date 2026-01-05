-- OnePage tables and policies
-- This script creates/updates the onepages table structure and related tables

-- Create onepages table if not exists
CREATE TABLE IF NOT EXISTS onepages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  avatar_video_url TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'password')),
  password_hash TEXT, -- For password-protected pages

  -- Theme (JSONB)
  theme JSONB NOT NULL DEFAULT '{
    "template_id": "minimal_white",
    "background_type": "solid",
    "background_color": "#ffffff",
    "text_color": "#000000",
    "secondary_text_color": "#6b7280",
    "button_style": "outline",
    "button_color": "#ffffff",
    "button_text_color": "#000000",
    "button_border_radius": 8,
    "button_border_width": 1,
    "button_border_color": "#e5e7eb",
    "font_family": "Inter",
    "card_width": "standard",
    "spacing": "normal",
    "header_layout": "classic"
  }'::jsonb,

  -- Settings (JSONB) - includes SEO, visibility, analytics, etc.
  settings JSONB NOT NULL DEFAULT '{
    "show_branding": true,
    "analytics_enabled": true,
    "seo_title": null,
    "seo_description": null,
    "social_image_url": null,
    "custom_domain": null,
    "visibility": "public",
    "contact_email": null,
    "contact_phone": null
  }'::jsonb,

  -- Social links (JSONB)
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Blocks (JSONB array)
  draft_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Published versions
  published_blocks JSONB,
  published_theme JSONB,
  published_profile JSONB,
  published_social_links JSONB,
  published_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create onepage_views table for analytics
CREATE TABLE IF NOT EXISTS onepage_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL REFERENCES onepages(id) ON DELETE CASCADE,
  visitor_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create onepage_clicks table for link click tracking
CREATE TABLE IF NOT EXISTS onepage_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL REFERENCES onepages(id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  url TEXT,
  visitor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create onepage_leads table for email captures
CREATE TABLE IF NOT EXISTS onepage_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL REFERENCES onepages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  block_id TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  lead_magnet_id UUID,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_applicable')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create onepage_lead_magnets table
CREATE TABLE IF NOT EXISTS onepage_lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL REFERENCES onepages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  email_subject TEXT NOT NULL DEFAULT 'Your download is ready',
  email_body TEXT NOT NULL DEFAULT 'Thanks for subscribing! Here is your download link.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create onepage_billing table for subscription/plan information
CREATE TABLE IF NOT EXISTS onepage_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (seller_id)
);

-- Create onepage_templates table for theme templates
CREATE TABLE IF NOT EXISTS onepage_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  preview_image_url TEXT,
  theme JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE onepages ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE onepage_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Owners can view their onepages" ON onepages;
DROP POLICY IF EXISTS "Owners can create onepages" ON onepages;
DROP POLICY IF EXISTS "Owners can update their onepages" ON onepages;
DROP POLICY IF EXISTS "Owners can delete their onepages" ON onepages;
DROP POLICY IF EXISTS "Anyone can view published onepages" ON onepages;

-- OnePage policies
CREATE POLICY "Owners can view their onepages"
  ON onepages
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can create onepages"
  ON onepages
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their onepages"
  ON onepages
  FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their onepages"
  ON onepages
  FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Anyone can view published onepages"
  ON onepages
  FOR SELECT
  USING (status = 'published' AND visibility = 'public');

-- OnePage views policies (allow anonymous inserts for tracking)
DROP POLICY IF EXISTS "Anyone can insert views" ON onepage_views;
DROP POLICY IF EXISTS "Owners can view their onepage views" ON onepage_views;

CREATE POLICY "Anyone can insert views"
  ON onepage_views
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can view their onepage views"
  ON onepage_views
  FOR SELECT
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

-- OnePage clicks policies
DROP POLICY IF EXISTS "Anyone can insert clicks" ON onepage_clicks;
DROP POLICY IF EXISTS "Owners can view their onepage clicks" ON onepage_clicks;

CREATE POLICY "Anyone can insert clicks"
  ON onepage_clicks
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can view their onepage clicks"
  ON onepage_clicks
  FOR SELECT
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

-- OnePage leads policies
DROP POLICY IF EXISTS "Anyone can insert leads" ON onepage_leads;
DROP POLICY IF EXISTS "Owners can view their onepage leads" ON onepage_leads;
DROP POLICY IF EXISTS "Owners can update their leads" ON onepage_leads;
DROP POLICY IF EXISTS "Owners can delete their leads" ON onepage_leads;

CREATE POLICY "Anyone can insert leads"
  ON onepage_leads
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can view their onepage leads"
  ON onepage_leads
  FOR SELECT
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can update their leads"
  ON onepage_leads
  FOR UPDATE
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

CREATE POLICY "Owners can delete their leads"
  ON onepage_leads
  FOR DELETE
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

-- OnePage lead magnets policies
DROP POLICY IF EXISTS "Owners can manage their lead magnets" ON onepage_lead_magnets;

CREATE POLICY "Owners can manage their lead magnets"
  ON onepage_lead_magnets
  FOR ALL
  USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));

-- OnePage billing policies
DROP POLICY IF EXISTS "Sellers can view their billing" ON onepage_billing;
DROP POLICY IF EXISTS "System can manage billing" ON onepage_billing;

CREATE POLICY "Sellers can view their billing"
  ON onepage_billing
  FOR SELECT
  USING (seller_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Allow service role to manage billing (for webhooks)
CREATE POLICY "System can manage billing"
  ON onepage_billing
  FOR ALL
  USING (auth.role() = 'service_role');

-- OnePage templates policies (public read, admin write)
DROP POLICY IF EXISTS "Anyone can view active templates" ON onepage_templates;

CREATE POLICY "Anyone can view active templates"
  ON onepage_templates
  FOR SELECT
  USING (is_active = true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_onepages_owner_id ON onepages(owner_id);
CREATE INDEX IF NOT EXISTS idx_onepages_seller_id ON onepages(seller_id);
CREATE INDEX IF NOT EXISTS idx_onepages_slug ON onepages(slug);
CREATE INDEX IF NOT EXISTS idx_onepages_status ON onepages(status);
CREATE INDEX IF NOT EXISTS idx_onepage_views_onepage_id ON onepage_views(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_views_created_at ON onepage_views(created_at);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_onepage_id ON onepage_clicks(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_created_at ON onepage_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_onepage_id ON onepage_leads(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_email ON onepage_leads(email);
CREATE INDEX IF NOT EXISTS idx_onepage_billing_seller_id ON onepage_billing(seller_id);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_onepages_updated_at ON onepages;
CREATE TRIGGER update_onepages_updated_at
  BEFORE UPDATE ON onepages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_onepage_lead_magnets_updated_at ON onepage_lead_magnets;
CREATE TRIGGER update_onepage_lead_magnets_updated_at
  BEFORE UPDATE ON onepage_lead_magnets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_onepage_billing_updated_at ON onepage_billing;
CREATE TRIGGER update_onepage_billing_updated_at
  BEFORE UPDATE ON onepage_billing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default templates
INSERT INTO onepage_templates (id, name, description, theme, sort_order, is_premium)
VALUES
  (
    'minimal_white',
    'Minimal White',
    'Clean and minimal design with white background',
    '{
      "template_id": "minimal_white",
      "background_type": "solid",
      "background_color": "#ffffff",
      "text_color": "#000000",
      "secondary_text_color": "#6b7280",
      "button_style": "outline",
      "button_color": "#ffffff",
      "button_text_color": "#000000",
      "button_border_radius": 8,
      "button_border_width": 1,
      "button_border_color": "#e5e7eb",
      "font_family": "Inter",
      "card_width": "standard",
      "spacing": "normal",
      "header_layout": "classic"
    }'::jsonb,
    1,
    false
  ),
  (
    'dark_mode',
    'Dark Mode',
    'Sleek dark theme with high contrast',
    '{
      "template_id": "dark_mode",
      "background_type": "solid",
      "background_color": "#0f0f0f",
      "text_color": "#ffffff",
      "secondary_text_color": "#9ca3af",
      "button_style": "filled",
      "button_color": "#ffffff",
      "button_text_color": "#000000",
      "button_border_radius": 12,
      "button_border_width": 0,
      "button_border_color": "#ffffff",
      "font_family": "Inter",
      "card_width": "standard",
      "spacing": "normal",
      "header_layout": "classic"
    }'::jsonb,
    2,
    false
  ),
  (
    'sunset_gradient',
    'Sunset Gradient',
    'Warm sunset gradient background',
    '{
      "template_id": "sunset_gradient",
      "background_type": "gradient",
      "background_color": "#ff6b6b",
      "background_gradient": "linear-gradient(135deg, #ff6b6b 0%, #ffa726 100%)",
      "text_color": "#ffffff",
      "secondary_text_color": "#ffffffcc",
      "button_style": "glass",
      "button_color": "#ffffff33",
      "button_text_color": "#ffffff",
      "button_border_radius": 16,
      "button_border_width": 1,
      "button_border_color": "#ffffff40",
      "font_family": "Inter",
      "card_width": "standard",
      "spacing": "comfortable",
      "header_layout": "hero"
    }'::jsonb,
    3,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Function to get onepage analytics summary
CREATE OR REPLACE FUNCTION get_onepage_analytics(p_onepage_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_views', (SELECT COUNT(*) FROM onepage_views WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval),
    'total_clicks', (SELECT COUNT(*) FROM onepage_clicks WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval),
    'total_leads', (SELECT COUNT(*) FROM onepage_leads WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval),
    'click_through_rate', CASE
      WHEN (SELECT COUNT(*) FROM onepage_views WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM onepage_clicks WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval)::numeric /
        (SELECT COUNT(*) FROM onepage_views WHERE onepage_id = p_onepage_id AND created_at > now() - (p_days || ' days')::interval)::numeric * 100,
        2
      )
      ELSE 0
    END
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

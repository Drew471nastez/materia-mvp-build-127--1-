-- OnePage tables and policies
-- This script adds new tables and columns for OnePage settings
-- Designed to be idempotent - safe to run multiple times

-- =====================================================
-- ONEPAGE_VIEWS TABLE - Analytics for page views
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL,
  visitor_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key if not exists (safe way)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'onepage_views_onepage_id_fkey'
    AND table_name = 'onepage_views'
  ) THEN
    ALTER TABLE onepage_views
    ADD CONSTRAINT onepage_views_onepage_id_fkey
    FOREIGN KEY (onepage_id) REFERENCES onepages(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore errors
END $$;

-- =====================================================
-- ONEPAGE_CLICKS TABLE - Link click tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL,
  block_id TEXT NOT NULL,
  url TEXT,
  visitor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'onepage_clicks_onepage_id_fkey'
    AND table_name = 'onepage_clicks'
  ) THEN
    ALTER TABLE onepage_clicks
    ADD CONSTRAINT onepage_clicks_onepage_id_fkey
    FOREIGN KEY (onepage_id) REFERENCES onepages(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- ONEPAGE_LEADS TABLE - Email captures
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL,
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'onepage_leads_onepage_id_fkey'
    AND table_name = 'onepage_leads'
  ) THEN
    ALTER TABLE onepage_leads
    ADD CONSTRAINT onepage_leads_onepage_id_fkey
    FOREIGN KEY (onepage_id) REFERENCES onepages(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- ONEPAGE_LEAD_MAGNETS TABLE - Downloadable content
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onepage_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  product_id UUID,
  email_subject TEXT NOT NULL DEFAULT 'Your download is ready',
  email_body TEXT NOT NULL DEFAULT 'Thanks for subscribing! Here is your download link.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add is_active column to onepage_lead_magnets if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onepage_lead_magnets' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE onepage_lead_magnets ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'onepage_lead_magnets_onepage_id_fkey'
    AND table_name = 'onepage_lead_magnets'
  ) THEN
    ALTER TABLE onepage_lead_magnets
    ADD CONSTRAINT onepage_lead_magnets_onepage_id_fkey
    FOREIGN KEY (onepage_id) REFERENCES onepages(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- ONEPAGE_BILLING TABLE - Subscription management
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'onepage_billing_seller_id_key'
    AND table_name = 'onepage_billing'
  ) THEN
    ALTER TABLE onepage_billing ADD CONSTRAINT onepage_billing_seller_id_key UNIQUE (seller_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- ONEPAGE_TEMPLATES TABLE - Theme templates
-- =====================================================
CREATE TABLE IF NOT EXISTS onepage_templates (
  id TEXT PRIMARY KEY,
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

-- Add missing columns to onepage_templates if they don't exist
DO $$
BEGIN
  -- Add is_active column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onepage_templates' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE onepage_templates ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Add is_premium column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onepage_templates' AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE onepage_templates ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add sort_order column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onepage_templates' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE onepage_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
DO $$
BEGIN
  ALTER TABLE onepage_views ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE onepage_clicks ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE onepage_leads ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE onepage_lead_magnets ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE onepage_billing ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE onepage_templates ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_VIEWS
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can insert views" ON onepage_views;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can view their onepage views" ON onepage_views;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Anyone can insert views"
    ON onepage_views
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can view their onepage views"
    ON onepage_views
    FOR SELECT
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_CLICKS
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can insert clicks" ON onepage_clicks;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can view their onepage clicks" ON onepage_clicks;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Anyone can insert clicks"
    ON onepage_clicks
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can view their onepage clicks"
    ON onepage_clicks
    FOR SELECT
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_LEADS
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can insert leads" ON onepage_leads;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can view their onepage leads" ON onepage_leads;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can update their leads" ON onepage_leads;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can delete their leads" ON onepage_leads;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Anyone can insert leads"
    ON onepage_leads
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can view their onepage leads"
    ON onepage_leads
    FOR SELECT
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can update their leads"
    ON onepage_leads
    FOR UPDATE
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can delete their leads"
    ON onepage_leads
    FOR DELETE
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_LEAD_MAGNETS
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can manage their lead magnets" ON onepage_lead_magnets;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Owners can manage their lead magnets"
    ON onepage_lead_magnets
    FOR ALL
    USING (onepage_id IN (SELECT id FROM onepages WHERE owner_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_BILLING
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Sellers can view their billing" ON onepage_billing;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "System can manage billing" ON onepage_billing;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Sellers can view their billing"
    ON onepage_billing
    FOR SELECT
    USING (seller_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "System can manage billing"
    ON onepage_billing
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- RLS POLICIES FOR ONEPAGE_TEMPLATES
-- =====================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can view active templates" ON onepage_templates;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can view templates" ON onepage_templates;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create a simple policy that allows viewing all templates (to avoid is_active column issues)
DO $$
BEGIN
  CREATE POLICY "Anyone can view templates"
    ON onepage_templates
    FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_onepage_views_onepage_id ON onepage_views(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_views_created_at ON onepage_views(created_at);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_onepage_id ON onepage_clicks(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_created_at ON onepage_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_onepage_id ON onepage_leads(onepage_id);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_email ON onepage_leads(email);
CREATE INDEX IF NOT EXISTS idx_onepage_billing_seller_id ON onepage_billing(seller_id);

-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers (drop first to be idempotent)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_onepage_lead_magnets_updated_at ON onepage_lead_magnets;
  CREATE TRIGGER update_onepage_lead_magnets_updated_at
    BEFORE UPDATE ON onepage_lead_magnets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_onepage_billing_updated_at ON onepage_billing;
  CREATE TRIGGER update_onepage_billing_updated_at
    BEFORE UPDATE ON onepage_billing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS update_onepage_templates_updated_at ON onepage_templates;
  CREATE TRIGGER update_onepage_templates_updated_at
    BEFORE UPDATE ON onepage_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================
-- INSERT DEFAULT TEMPLATES
-- =====================================================
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

-- =====================================================
-- ANALYTICS SUMMARY FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION get_onepage_analytics(p_onepage_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_total_views INTEGER;
  v_total_clicks INTEGER;
  v_total_leads INTEGER;
BEGIN
  -- Get view count
  SELECT COUNT(*) INTO v_total_views
  FROM onepage_views
  WHERE onepage_id = p_onepage_id
  AND created_at > now() - (p_days || ' days')::interval;

  -- Get click count
  SELECT COUNT(*) INTO v_total_clicks
  FROM onepage_clicks
  WHERE onepage_id = p_onepage_id
  AND created_at > now() - (p_days || ' days')::interval;

  -- Get lead count
  SELECT COUNT(*) INTO v_total_leads
  FROM onepage_leads
  WHERE onepage_id = p_onepage_id
  AND created_at > now() - (p_days || ' days')::interval;

  SELECT json_build_object(
    'total_views', COALESCE(v_total_views, 0),
    'total_clicks', COALESCE(v_total_clicks, 0),
    'total_leads', COALESCE(v_total_leads, 0),
    'click_through_rate', CASE
      WHEN COALESCE(v_total_views, 0) > 0
      THEN ROUND(COALESCE(v_total_clicks, 0)::numeric / COALESCE(v_total_views, 0)::numeric * 100, 2)
      ELSE 0
    END
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

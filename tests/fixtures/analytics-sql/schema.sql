-- A throwaway database with the tables part 60 touches, as the repository's SQL made them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text);
CREATE TABLE public.creators (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, slug text);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid REFERENCES public.creators(id), title text, status text DEFAULT 'published');
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, amount_cents integer, tip_cents integer, status text, stripe_session_id text, refund_amount_cents integer, source text, created_at timestamptz DEFAULT now());
CREATE TABLE public.onepages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seller_id uuid, creator_id uuid, owner_id uuid, slug text, status text DEFAULT 'published');
CREATE TABLE public.onepage_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onepage_id uuid, visitor_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.onepage_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onepage_id uuid, block_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.onepage_leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onepage_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.store_theme_installs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, status text, sort_order integer DEFAULT 0);
CREATE TABLE public.custom_domains (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, domain text, status text, purpose text, is_primary boolean);

-- analytics_events: scripts/023_analytics_migration.sql, then supabase/migrations/20260212_fix_analytics_events_columns.sql
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('session_start','store_view','product_view','add_to_cart','checkout_start','purchase')),
  session_id TEXT NOT NULL,
  visitor_id TEXT,
  referrer TEXT, referrer_domain TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  country_code TEXT, country_name TEXT, region TEXT, city TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  browser TEXT, os TEXT, page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_analytics_creator_date ON public.analytics_events(creator_id, created_at DESC);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_event_type_check CHECK (event_type IN ('view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart', 'checkout_start'));
ALTER TABLE public.analytics_events ADD COLUMN utm_term TEXT, ADD COLUMN utm_content TEXT, ADD COLUMN screen_width INTEGER, ADD COLUMN screen_height INTEGER, ADD COLUMN language TEXT, ADD COLUMN source_category TEXT;
CREATE TABLE public.email_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email_type text);
-- What supabase/sql/run-now/99_check_after.sql casts to regclass, so the whole check can run here.
CREATE TABLE public.email_flows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trigger_type text, status text);
CREATE TABLE public.payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);

-- Run this in your Supabase SQL Editor
-- This creates the enhanced analytics_events table with Gumroad-style tracking

-- Drop existing table if it exists (backup data first if needed)
DROP TABLE IF EXISTS public.analytics_events CASCADE;

-- Create comprehensive analytics_events table
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_start',
    'store_view',
    'product_view',
    'add_to_cart',
    'checkout_start',
    'purchase'
  )),
  
  session_id TEXT NOT NULL,
  visitor_id TEXT,
  
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  country_code TEXT,
  country_name TEXT,
  region TEXT,
  city TEXT,
  
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  browser TEXT,
  os TEXT,
  
  page_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_analytics_creator_date ON public.analytics_events(creator_id, created_at DESC);
CREATE INDEX idx_analytics_product ON public.analytics_events(product_id);
CREATE INDEX idx_analytics_session ON public.analytics_events(session_id);
CREATE INDEX idx_analytics_visitor ON public.analytics_events(visitor_id);
CREATE INDEX idx_analytics_event_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_referrer ON public.analytics_events(referrer_domain);
CREATE INDEX idx_analytics_country ON public.analytics_events(country_code);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Creators can view their own analytics
CREATE POLICY "Creators can view their own analytics"
  ON public.analytics_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = analytics_events.creator_id AND c.user_id = auth.uid()
  ));

-- Allow inserts for tracking (from anyone)
CREATE POLICY "Allow insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

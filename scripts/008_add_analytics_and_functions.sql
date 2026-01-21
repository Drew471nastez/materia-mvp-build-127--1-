-- Add analytics_events table
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('store_view', 'product_view', 'purchase')),
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Creators can view their own analytics
CREATE POLICY "Creators can view their own analytics"
  ON public.analytics_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = analytics_events.creator_id AND c.user_id = auth.uid()
  ));

-- Allow inserts from authenticated users (for tracking)
CREATE POLICY "Allow insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_analytics_creator ON public.analytics_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_analytics_product ON public.analytics_events(product_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.analytics_events(created_at);

-- Add sales_count to products for quick lookup
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

-- Function to increment product sales
CREATE OR REPLACE FUNCTION increment_product_sales(p_product_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.products 
  SET sales_count = COALESCE(sales_count, 0) + 1 
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

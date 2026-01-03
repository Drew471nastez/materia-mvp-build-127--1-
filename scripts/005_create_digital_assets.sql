-- Create digital_assets table for file downloads
CREATE TABLE IF NOT EXISTS public.digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

-- Only creators can manage their assets, buyers can view if entitled
CREATE POLICY "Creators can manage their digital assets"
  ON public.digital_assets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = digital_assets.product_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Entitled buyers can view digital assets"
  ON public.digital_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.product_id = digital_assets.product_id AND e.buyer_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_digital_assets_product ON public.digital_assets(product_id);

-- Create product_variants table for product variants (different tiers, versions, etc.)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  compare_at_cents INTEGER,
  position INTEGER NOT NULL DEFAULT 0, -- Order position (0 = first variant, used as default)
  is_default BOOLEAN DEFAULT FALSE, -- First variant should be true by default
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on product_variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Published variants are viewable by everyone (via product's status)
CREATE POLICY "Variants visible for published products"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
      AND (p.status = 'published' OR EXISTS (
        SELECT 1 FROM public.creators c WHERE c.id = p.creator_id AND c.user_id = auth.uid()
      ))
    )
  );

-- Creators can insert variants for their own products
CREATE POLICY "Creators can insert variants for their products"
  ON public.product_variants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_id AND c.user_id = auth.uid()
    )
  );

-- Creators can update their own product variants
CREATE POLICY "Creators can update their product variants"
  ON public.product_variants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()
    )
  );

-- Creators can delete their own product variants
CREATE POLICY "Creators can delete their product variants"
  ON public.product_variants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_variants.product_id AND c.user_id = auth.uid()
    )
  );

-- Create indexes for variants
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_position ON public.product_variants(product_id, position);

-- Create variant_digital_assets table to link digital assets to specific variants
CREATE TABLE IF NOT EXISTS public.variant_digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.digital_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, asset_id)
);

-- Enable RLS on variant_digital_assets
ALTER TABLE public.variant_digital_assets ENABLE ROW LEVEL SECURITY;

-- Variant digital assets visible to anyone who can see the variant
CREATE POLICY "Variant assets visible with variant"
  ON public.variant_digital_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = variant_digital_assets.variant_id
      AND (p.status = 'published' OR EXISTS (
        SELECT 1 FROM public.creators c WHERE c.id = p.creator_id AND c.user_id = auth.uid()
      ))
    )
  );

-- Creators can insert variant digital assets
CREATE POLICY "Creators can insert variant digital assets"
  ON public.variant_digital_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON c.id = p.creator_id
      WHERE pv.id = variant_id AND c.user_id = auth.uid()
    )
  );

-- Creators can delete variant digital assets
CREATE POLICY "Creators can delete variant digital assets"
  ON public.variant_digital_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      JOIN public.creators c ON c.id = p.creator_id
      WHERE pv.id = variant_digital_assets.variant_id AND c.user_id = auth.uid()
    )
  );

-- Create index for variant digital assets
CREATE INDEX IF NOT EXISTS idx_variant_digital_assets_variant_id ON public.variant_digital_assets(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_digital_assets_asset_id ON public.variant_digital_assets(asset_id);

-- Add variant_id column to entitlements to track which variant was purchased
ALTER TABLE public.entitlements ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id);
CREATE INDEX IF NOT EXISTS idx_entitlements_variant_id ON public.entitlements(variant_id) WHERE variant_id IS NOT NULL;

-- Add variant_id column to orders to track which variant was ordered
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id);
CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON public.orders(variant_id) WHERE variant_id IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_variant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_variant_updated_at();

-- Add has_variants column to products table for quick checking
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;

-- Function to update has_variants when variants are added/removed
CREATE OR REPLACE FUNCTION update_product_has_variants()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products SET has_variants = TRUE WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if any variants remain
    UPDATE public.products SET has_variants = (
      SELECT COUNT(*) > 0 FROM public.product_variants WHERE product_id = OLD.product_id
    ) WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to maintain has_variants flag
DROP TRIGGER IF EXISTS update_has_variants_on_insert ON public.product_variants;
CREATE TRIGGER update_has_variants_on_insert
  AFTER INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_has_variants();

DROP TRIGGER IF EXISTS update_has_variants_on_delete ON public.product_variants;
CREATE TRIGGER update_has_variants_on_delete
  AFTER DELETE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_has_variants();

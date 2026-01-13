-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('digital', 'course', 'community')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  includes_community BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_product_slug_per_creator UNIQUE (creator_id, slug)
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policies for products
CREATE POLICY "Published products are viewable by everyone"
  ON public.products FOR SELECT
  USING (status = 'published' OR EXISTS (
    SELECT 1 FROM public.creators WHERE id = products.creator_id AND user_id = auth.uid()
  ));

CREATE POLICY "Creators can insert their own products"
  ON public.products FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid()
  ));

CREATE POLICY "Creators can update their own products"
  ON public.products FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid()
  ));

CREATE POLICY "Creators can delete their own products"
  ON public.products FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.creators WHERE id = creator_id AND user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_creator ON public.products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(type);

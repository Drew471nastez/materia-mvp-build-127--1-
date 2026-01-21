-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT CHECK (type IN ('digital', 'service', 'physical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create product_categories join table (many-to-many)
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, category_id)
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Policies for categories (read-only for everyone)
CREATE POLICY "Categories are viewable by everyone"
  ON public.categories FOR SELECT
  USING (true);

-- Policies for product_categories
CREATE POLICY "Product categories are viewable by everyone"
  ON public.product_categories FOR SELECT
  USING (true);

CREATE POLICY "Creators can insert their product categories"
  ON public.product_categories FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products 
    INNER JOIN public.creators ON products.creator_id = creators.id
    WHERE products.id = product_id AND creators.user_id = auth.uid()
  ));

CREATE POLICY "Creators can delete their product categories"
  ON public.product_categories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.products 
    INNER JOIN public.creators ON products.creator_id = creators.id
    WHERE products.id = product_id AND creators.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON public.product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON public.product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_type ON public.categories(type);

-- Insert predefined categories
INSERT INTO public.categories (name, slug, type) VALUES
  -- Digital Products
  ('Ebooks', 'ebooks', 'digital'),
  ('Templates', 'templates', 'digital'),
  ('Notion Templates', 'notion-templates', 'digital'),
  ('Shopify Themes', 'shopify-themes', 'digital'),
  ('Website Templates', 'website-templates', 'digital'),
  ('UI Kits', 'ui-kits', 'digital'),
  ('Design Assets', 'design-assets', 'digital'),
  ('Icons', 'icons', 'digital'),
  ('Fonts', 'fonts', 'digital'),
  ('Courses', 'courses', 'digital'),
  ('Video Courses', 'video-courses', 'digital'),
  ('Presets', 'presets', 'digital'),
  ('Software', 'software', 'digital'),
  ('Tools', 'tools', 'digital'),
  ('Plugins', 'plugins', 'digital'),
  ('Scripts', 'scripts', 'digital'),
  ('Marketing Assets', 'marketing-assets', 'digital'),
  ('Social Media Templates', 'social-media-templates', 'digital'),
  ('Printables', 'printables', 'digital'),
  ('Bundles', 'bundles', 'digital'),
  -- Services
  ('Services', 'services', 'service'),
  ('Consulting', 'consulting', 'service'),
  ('Coaching', 'coaching', 'service')
ON CONFLICT (slug) DO NOTHING;

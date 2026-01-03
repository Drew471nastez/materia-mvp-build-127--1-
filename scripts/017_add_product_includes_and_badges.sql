-- Add whats_included column to products for custom bullet points
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS whats_included text[] DEFAULT ARRAY['Instant download access', 'All included files', 'Lifetime access'];

-- Add show_sales_badge column to products for per-product toggle
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_sales_badge boolean DEFAULT true;

-- Add show_total_sales_badge column to creators for storefront toggle
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS show_total_sales_badge boolean DEFAULT true;

-- Add buyer_email column to orders for guest purchases
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_email text;

-- Add access_token column to orders for secure guest download links
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS access_token text UNIQUE;

-- Create index on access_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_access_token ON public.orders(access_token) WHERE access_token IS NOT NULL;

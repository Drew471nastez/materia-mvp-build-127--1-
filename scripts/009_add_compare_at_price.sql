-- Add compare_at_cents column for sale pricing
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.products.compare_at_cents IS 'Original price before discount, used for showing sale prices';

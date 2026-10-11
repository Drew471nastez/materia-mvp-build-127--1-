/* Limit sales for things that ship: `products.max_per_order`, the most one order may take of a physical product (a limited drop sold "up to 2 per order"), set under Settings in the product editor. The product page's quantity stops at it and the checkout refuses a cart over it with the reason. A whole number from 1 to 999, or null for no limit; no rows change. Needs nothing else. Until it runs, the editor saves everything else and says a typed limit needs this part, and nothing is limited. Safe to run again. */
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_per_order integer;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_max_per_order_check;
ALTER TABLE public.products ADD CONSTRAINT products_max_per_order_check CHECK (max_per_order IS NULL OR (max_per_order >= 1 AND max_per_order <= 999));
notify pgrst, 'reload schema';

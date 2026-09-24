-- ============================================================================
--  WHERE AN ORDER CAME FROM
--
--  The same columns as supabase/sql/RUN_ORDER_SOURCE.sql, for a database
--  built from migrations. `source` is 'storelib' or 'website' (Analytics
--  counts sales by it); `source_detail` is which page Buy was pressed on and
--  where the visit came from, hosts and words only. Both are written by an
--  update after the order is saved (lib/orders/order-source.ts), so the code
--  works before this runs. Additive, and safe to run twice.
-- ============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_detail jsonb;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check CHECK (source IS NULL OR source IN ('storelib', 'website'));

NOTIFY pgrst, 'reload schema';

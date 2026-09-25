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

-- Orders from before the column, as in RUN_ORDER_SOURCE.sql: several orders
-- under one Stripe session are a basket, and a basket is only ever filled on
-- a website. Everything else from before is left empty rather than guessed.
UPDATE public.orders o
   SET source = 'website'
 WHERE o.source IS NULL
   AND o.stripe_session_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.orders other
      WHERE other.stripe_session_id = o.stripe_session_id
        AND other.id <> o.id
   );

NOTIFY pgrst, 'reload schema';

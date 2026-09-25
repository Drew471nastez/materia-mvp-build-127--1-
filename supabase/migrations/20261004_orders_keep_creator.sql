-- ===========================================================================
--  SALES KEPT WHEN A PRODUCT IS DELETED (run-now part 32)
-- ===========================================================================
-- WHAT WAS WRONG. orders.product_id was NOT NULL and referenced products ON
-- DELETE CASCADE (scripts/004_create_orders_entitlements.sql). Deleting a
-- product from the Products page therefore deleted every order of it: its
-- sales vanished from Home, Analytics, Orders and the all time totals, and
-- the payment history of real money went with them. Orders also had no
-- creator of their own, so the only way to find a creator's orders was
-- through their current products (Analytics listed every product id in the
-- URL, which also grew without bound for a large catalog).
--
-- WHAT IS CORRECT, and what this does:
--
--   An order is a record of a payment and outlives the product. Deleting a
--   product now sets the order's product_id to NULL (ON DELETE SET NULL);
--   the order stays, counted in every figure, and Analytics lists its money
--   under "Removed product".
--
--   Each order carries its creator (orders.creator_id), written for every
--   order already there from its product, and by a trigger from then on, so
--   nobody has to remember to set it. It is what the app reads a creator's
--   orders by (app/api/analytics/reports, lib/analytics/store-orders).
--   Deleting the creator (the whole account) still deletes their orders, as
--   it did through products before.
--
--   The status check, where the database still has the original one, also
--   allows 'disputed', which the Stripe dispute webhook writes
--   (lib/stripe/dispute-orders). Every value it allowed before stays allowed.
--
--   analytics_all_time (part 25) counts by orders.creator_id instead of
--   "product_id IN (the creator's current products)", so the all time line
--   keeps deleted products' sales too.
--
-- Safe to run again: every statement checks first. NOT VALID constraints do
-- not re-read old rows, so this cannot fail on an old orphan.


-- Each order's creator.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS creator_id uuid;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_creator_id_fkey') THEN ALTER TABLE public.orders ADD CONSTRAINT orders_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.creators(id) ON DELETE CASCADE NOT VALID; END IF; END $$;

-- Every order already there, from its product.
UPDATE public.orders o SET creator_id = p.creator_id FROM public.products p WHERE p.id = o.product_id AND o.creator_id IS DISTINCT FROM p.creator_id;

-- And from then on, by the product, whatever wrote the order. SECURITY DEFINER
-- so the product is found even when the writer cannot read it; it reads one
-- column of one row and writes nothing else.
CREATE OR REPLACE FUNCTION public.orders_fill_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN IF NEW.product_id IS NOT NULL THEN NEW.creator_id := (SELECT p.creator_id FROM public.products p WHERE p.id = NEW.product_id); END IF; RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS orders_fill_creator ON public.orders;
CREATE TRIGGER orders_fill_creator BEFORE INSERT OR UPDATE OF product_id, creator_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_fill_creator();

-- In the order the reports read: creator, time, id.
CREATE INDEX IF NOT EXISTS idx_orders_creator_time_id ON public.orders (creator_id, created_at, id);

-- A deleted product leaves its orders, with no product.
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT con.conname FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'f' AND con.confrelid = 'public.products'::regclass AND con.confdeltype <> 'n' AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'product_id')] LOOP EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname); END LOOP; IF NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'f' AND con.confrelid = 'public.products'::regclass AND con.confdeltype = 'n') THEN ALTER TABLE public.orders ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL NOT VALID; END IF; END $$;

-- 'disputed' allowed where the original status check is still in place.
DO $$ DECLARE c record; BEGIN FOR c IN SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ~ '^CHECK \(\(status = ANY \(ARRAY\[' AND pg_get_constraintdef(con.oid) !~ '''disputed''' LOOP EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname); EXECUTE format('ALTER TABLE public.orders ADD CONSTRAINT %I CHECK (status = ANY (%L::text[])) NOT VALID', c.conname, ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(c.def, '''([^'']+)''', 'g') AS m) || ARRAY['disputed']); END LOOP; END $$;

-- All time, by the order's creator (was: product_id IN the creator's current products).
CREATE OR REPLACE FUNCTION public.analytics_all_time(p_creator_id uuid, p_product_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $fn$WITH lines AS ( SELECT coalesce('s:' || nullif(o.stripe_session_id, ''), 'o:' || o.id::text) AS k, o.status, greatest(0, coalesce(o.amount_cents, 0))::bigint AS gross, CASE WHEN o.status = 'refunded' THEN CASE WHEN o.refund_amount_cents > 0 THEN least(o.refund_amount_cents, greatest(0, coalesce(o.amount_cents, 0))) ELSE greatest(0, coalesce(o.amount_cents, 0)) END ELSE 0 END::bigint AS refunded FROM public.orders o WHERE o.creator_id = p_creator_id AND (p_product_id IS NULL OR o.product_id = p_product_id) ), payments AS ( SELECT k, bool_and(coalesce(status = 'failed', false)) AS all_failed, bool_or(coalesce(status = 'pending', false)) AS any_pending, bool_or(coalesce(status = 'disputed', false)) AS any_disputed, greatest(0, sum(gross) - sum(refunded)) AS net FROM lines GROUP BY k ) SELECT jsonb_build_object( 'views', ( SELECT count(*) FROM public.analytics_events e WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id) ), 'orders', (SELECT count(*) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed), 'sales_cents', (SELECT coalesce(sum(net), 0) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed) )$fn$;
REVOKE ALL ON FUNCTION public.analytics_all_time(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_all_time(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.orders_fill_creator() FROM PUBLIC, anon, authenticated;

notify pgrst, 'reload schema';

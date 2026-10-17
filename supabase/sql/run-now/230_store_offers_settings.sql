/* Upsells and bundles, every setting (round V): on `store_offers`, the trigger collections of a checkout offer (a product from any of them in the cart qualifies it), where each offer shows (`placements`: product page, cart, checkout), its start and end, whether a discount code can be used on top (`combines_with_codes`, true by default; when false the buyer gets whichever saves more), a limit per order (complete sets for a bundle, units for a checkout offer), a minimum for the rest of the cart, and free shipping as a discount. Existing offers keep what they did: shown everywhere, no dates, combining with codes, no limits. Owner reads, only the server writes, as part 116 set. Safe to run again. */
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS trigger_collection_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS placements text[] NOT NULL DEFAULT ARRAY['product', 'cart', 'checkout']::text[];
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS combines_with_codes boolean NOT NULL DEFAULT true;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS max_per_order integer;
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS min_subtotal_cents integer;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.store_offers'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%discount_type%' AND pg_get_constraintdef(oid) LIKE '%''none''%' AND pg_get_constraintdef(oid) NOT LIKE '%free_shipping%' LOOP EXECUTE format('ALTER TABLE public.store_offers DROP CONSTRAINT %I', c.conname); END LOOP; END $$;
ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_discount_type_check;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_discount_type_check CHECK (discount_type IN ('percent', 'fixed', 'free_shipping', 'none'));
ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_settings_shape;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_settings_shape CHECK (cardinality(trigger_collection_ids) <= 20 AND placements <@ ARRAY['product', 'cart', 'checkout']::text[] AND cardinality(placements) BETWEEN 1 AND 3 AND (max_per_order IS NULL OR max_per_order BETWEEN 1 AND 99) AND (min_subtotal_cents IS NULL OR min_subtotal_cents BETWEEN 0 AND 10000000) AND (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at));
ALTER TABLE public.store_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_offers_owner_read ON public.store_offers;
CREATE POLICY store_offers_owner_read ON public.store_offers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.creators c WHERE c.id = store_offers.creator_id AND c.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_offers FROM PUBLIC, anon, authenticated;
notify pgrst, 'reload schema';

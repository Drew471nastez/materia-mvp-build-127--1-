/* Quantity breaks and Buy X get Y free (round AF, run after 116 and 230): `store_offers` takes a third kind, `quantity_break`, for one product (one id in `product_ids`) or every product of one collection (no product, the collection in `trigger_collection_ids`), with its tiers in a new `tiers` column (jsonb, a list of up to six { quantity, freeQuantity, discountType percent, amount or none, discountValue, label, badge }; `[]` for every other offer). The kind check and the shape check are replaced with ones that keep every row they took before. No existing row changes. Owner reads, only the server writes, as part 116 set. Safe to run again. */
ALTER TABLE public.store_offers ADD COLUMN IF NOT EXISTS tiers jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.store_offers'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%' AND pg_get_constraintdef(oid) LIKE '%''checkout''%' AND pg_get_constraintdef(oid) NOT LIKE '%quantity_break%' AND pg_get_constraintdef(oid) NOT LIKE '%cardinality%' LOOP EXECUTE format('ALTER TABLE public.store_offers DROP CONSTRAINT %I', c.conname); END LOOP; END $$;
ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_kind_check;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_kind_check CHECK (kind IN ('bundle', 'checkout', 'quantity_break'));
ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_shape;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_shape CHECK ((kind = 'bundle' AND cardinality(product_ids) BETWEEN 2 AND 5) OR (kind = 'checkout' AND cardinality(product_ids) = 1) OR (kind = 'quantity_break' AND cardinality(product_ids) <= 1));
ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_tiers;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_tiers CHECK (jsonb_typeof(tiers) = 'array' AND jsonb_array_length(tiers) <= 6 AND (kind <> 'quantity_break' OR jsonb_array_length(tiers) >= 1));
ALTER TABLE public.store_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_offers_owner_read ON public.store_offers;
CREATE POLICY store_offers_owner_read ON public.store_offers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.creators c WHERE c.id = store_offers.creator_id AND c.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_offers FROM PUBLIC, anon, authenticated;
notify pgrst, 'reload schema';

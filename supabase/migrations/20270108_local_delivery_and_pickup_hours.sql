/* Local delivery and pickup hours on a location (Settings > Locations): the seller brings orders to buyers whose postal code starts with one of the location's codes, in its country, for its price (free from its free over value, when the order reaches its minimum); and the opening hours buyers can collect in. New columns on inventory_locations only, every one with a default, so no row changes. Server only, as the table already is. Needs part 78. Until it runs, a location saves as before and says local delivery and pickup hours turn on after this part. Safe to run again. */
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS pickup_hours text;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_codes text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_min_cents integer;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_free_over_cents integer;
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS local_delivery_note text;
ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_local_delivery_check;
ALTER TABLE public.inventory_locations ADD CONSTRAINT inventory_locations_local_delivery_check CHECK ((pickup_hours IS NULL OR char_length(pickup_hours) <= 300) AND cardinality(local_delivery_codes) <= 500 AND local_delivery_price_cents BETWEEN 0 AND 10000000 AND (local_delivery_min_cents IS NULL OR local_delivery_min_cents BETWEEN 0 AND 10000000) AND (local_delivery_free_over_cents IS NULL OR local_delivery_free_over_cents BETWEEN 0 AND 10000000) AND (local_delivery_note IS NULL OR char_length(local_delivery_note) <= 500)) NOT VALID;
notify pgrst, 'reload schema';

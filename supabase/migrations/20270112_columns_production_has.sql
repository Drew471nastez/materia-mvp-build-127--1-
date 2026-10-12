/* Columns production has that no file here ever created, so a database built from this repository matches it. They were made in the Supabase dashboard before the repository kept SQL, and the app has read and written them since: creators.support_email (Settings > Store details' contact email, where receipts and seller emails reply to), profiles.welcome_completed (signup and onboarding), the Address card's profiles.address_line1, address_line2, city, state, postal_code, country and the payout form's first_name, last_name, onepages.seller_id (whose store a OnePage subscribes to) and products.inventory_count (a counted product's stock, read by the shop's lists). Each is added only where it is missing, nullable, with no default except welcome_completed's false, so no existing row changes. onepages is skipped where that table is not there. Then the column grants part 63 keeps are applied again (storelib_share_public_columns), as they were when these columns already existed in production. Needs nothing else. Safe to run again. */
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS support_email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_completed boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS inventory_count integer;
DO $do$ BEGIN IF to_regclass('public.onepages') IS NULL THEN RAISE NOTICE 'onepages.seller_id skipped: public.onepages does not exist here'; RETURN; END IF; ALTER TABLE public.onepages ADD COLUMN IF NOT EXISTS seller_id uuid; END $do$;
DO $do$ BEGIN IF to_regprocedure('public.storelib_share_public_columns()') IS NOT NULL THEN PERFORM public.storelib_share_public_columns(); END IF; END $do$;
notify pgrst, 'reload schema';

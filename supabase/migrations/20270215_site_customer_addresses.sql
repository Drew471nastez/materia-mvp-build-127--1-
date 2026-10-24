-- Customer accounts on websites, round BC: a customer keeps their own phone
-- number and their own address book on the website they signed in to (add,
-- change, delete, pick the default), and checkout fills in the default one.
-- Two columns on site_customers, both optional:
--   phone      what the customer typed on their profile, at most 40 characters
--   addresses  the address book, a JSON list of at most 10 addresses. NULL
--              means the customer never changed it, and the account shows the
--              addresses their orders were sent to instead; [] means they
--              removed every one.
-- Server only, like the rest of the table. Until it runs, the account page
-- shows the addresses of past orders and the forms say they could not save.
ALTER TABLE public.site_customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.site_customers ADD COLUMN IF NOT EXISTS addresses jsonb;
ALTER TABLE public.site_customers DROP CONSTRAINT IF EXISTS site_customers_phone_size;
ALTER TABLE public.site_customers ADD CONSTRAINT site_customers_phone_size CHECK (char_length(coalesce(phone, '')) <= 40);
ALTER TABLE public.site_customers DROP CONSTRAINT IF EXISTS site_customers_addresses_shape;
ALTER TABLE public.site_customers ADD CONSTRAINT site_customers_addresses_shape CHECK (addresses IS NULL OR (jsonb_typeof(addresses) = 'array' AND jsonb_array_length(addresses) <= 10 AND pg_column_size(addresses) <= 32768));
notify pgrst, 'reload schema';

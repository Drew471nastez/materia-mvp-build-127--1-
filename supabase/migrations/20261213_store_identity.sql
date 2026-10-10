/* What a store signs its receipts, order emails and buyer cases with. Two more columns on `store_settings` (part 109): `logo_url`, the picture at the top of every receipt and customer email (when empty, the website's logo, then the person's photo), and `contact_email`, where buyers' replies and questions go (when empty, the support email on the creator, then the owner's own). Safe to run again. */
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_logo_url_check;
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_logo_url_check CHECK (logo_url IS NULL OR length(logo_url) BETWEEN 1 AND 600);
ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_contact_email_check;
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_contact_email_check CHECK (contact_email IS NULL OR (length(contact_email) BETWEEN 3 AND 254 AND position('@' in contact_email) > 1));
notify pgrst, 'reload schema';

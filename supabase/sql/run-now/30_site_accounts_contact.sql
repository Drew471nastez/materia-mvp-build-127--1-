/* Website accounts: every sign in code storelib.com gives a creator's website is exchanged once, and its id is kept here. Written and read by the server only. */
CREATE TABLE IF NOT EXISTS public.site_account_codes ( jti text PRIMARY KEY, creator_id uuid NOT NULL, user_id uuid NOT NULL, host text NOT NULL, used_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS site_account_codes_used_at ON public.site_account_codes (used_at);
ALTER TABLE public.site_account_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_account_codes FROM anon, authenticated;
GRANT ALL ON public.site_account_codes TO service_role;
/* Contact form messages from a creator's website. The creator reads their own; nobody but the server writes. */
CREATE TABLE IF NOT EXISTS public.site_contact_messages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL, email text NOT NULL, name text, subject text, message text NOT NULL, consent boolean NOT NULL DEFAULT false, site text, page text, source_detail jsonb, emailed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.site_contact_messages DROP CONSTRAINT IF EXISTS site_contact_messages_email_lower;
ALTER TABLE public.site_contact_messages ADD CONSTRAINT site_contact_messages_email_lower CHECK (email = lower(email)) NOT VALID;
ALTER TABLE public.site_contact_messages DROP CONSTRAINT IF EXISTS site_contact_messages_sizes;
ALTER TABLE public.site_contact_messages ADD CONSTRAINT site_contact_messages_sizes CHECK (char_length(message) <= 5000 AND char_length(coalesce(subject, '')) <= 150 AND char_length(coalesce(name, '')) <= 120) NOT VALID;
CREATE INDEX IF NOT EXISTS site_contact_messages_creator_created ON public.site_contact_messages (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS site_contact_messages_creator_email ON public.site_contact_messages (creator_id, email);
ALTER TABLE public.site_contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.site_contact_messages FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own contact messages" ON public.site_contact_messages;
CREATE POLICY "Creators read their own contact messages" ON public.site_contact_messages FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT SELECT ON public.site_contact_messages TO authenticated;
GRANT ALL ON public.site_contact_messages TO service_role;
/* A contact who wrote through a contact form and did not ask for news is status 'wrote': kept, never sent a campaign. Rows already there are not rechecked. */
ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_status_check;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_status_check CHECK (status IS NULL OR status IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned', 'customer', 'wrote')) NOT VALID;
notify pgrst, 'reload schema';

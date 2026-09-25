/* Buyers kept as contacts, one contact per address, and started checkouts for the checkout reminder. */
ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_status_check;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_status_check CHECK (status IS NULL OR status IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned', 'customer')) NOT VALID;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.subscribers GROUP BY creator_id, lower(email) HAVING count(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS subscribers_creator_email_lower ON public.subscribers (creator_id, lower(email)); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.checkout_starts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, product_id uuid REFERENCES public.products(id) ON DELETE CASCADE, variant_id uuid, product_title text, email text NOT NULL, first_name text, payment_intent_id text NOT NULL, email_opt_in boolean NOT NULL DEFAULT false, source_detail jsonb, created_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz, outcome text );
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_email_lower;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_email_lower CHECK (email = lower(email)) NOT VALID;
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_outcome_check;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_outcome_check CHECK (outcome IS NULL OR outcome IN ('bought', 'unsubscribed', 'no_consent', 'entered')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS checkout_starts_intent ON public.checkout_starts (payment_intent_id);
CREATE INDEX IF NOT EXISTS checkout_starts_due ON public.checkout_starts (created_at) WHERE handled_at IS NULL;
CREATE INDEX IF NOT EXISTS checkout_starts_contact ON public.checkout_starts (creator_id, email);
ALTER TABLE public.checkout_starts ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.checkout_starts FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own started checkouts" ON public.checkout_starts;
CREATE POLICY "Creators read their own started checkouts" ON public.checkout_starts FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.checkout_starts TO service_role;
notify pgrst, 'reload schema';

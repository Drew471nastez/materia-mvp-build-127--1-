/* Migration: the same statements as supabase/sql/RUN_CHECKOUT_CONTACTS.sql, which is the file to paste. */
/* ===========================================================================
   CHECKOUT CONTACTS AND CHECKOUT REMINDERS

   Paste the whole thing into the Supabase SQL editor and press Run. Safe to
   run more than once: every line checks before it acts. Nothing is deleted
   or rewritten.

   ONE STATEMENT PER LINE, on purpose. Let the editor wrap the long ones and
   do not reformat them.

   BEFORE THIS RUNS the app keeps working: a buyer who ticked "Email me news
   and offers" is recorded as a subscribed contact as before; a buyer who did
   not is kept as a customer and an order, and joins the contacts once this
   has run; started checkouts are not recorded, so a checkout reminder never
   starts.

   AFTER THIS RUNS every checkout records its buyer as a contact (subscribed
   or customer), a checkout that reached Pay is written down once, and the
   hourly cron sends checkout reminders to people who ticked the box. The
   last line prints a row: every number should read 1.
   =========================================================================== */

/* 1 of 4  A buyer who did not ask for news is a customer contact: their order's emails reach them, campaigns never do (campaigns send to status subscribed only). NOT VALID, so rows already there are not rechecked. */
ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_status_check;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_status_check CHECK (status IS NULL OR status IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned', 'customer')) NOT VALID;

/* 2 of 4  One contact per creator and address, whatever its case. Built only when no two rows already share one (the verification row says whether it was), so running this can never fail on old data. */
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.subscribers GROUP BY creator_id, lower(email) HAVING count(*) > 1) THEN CREATE UNIQUE INDEX IF NOT EXISTS subscribers_creator_email_lower ON public.subscribers (creator_id, lower(email)); END IF; END $$;

/* 3 of 4  A checkout that reached Pay, one row per PaymentIntent, for the checkout reminder. The address in lower case, whether they ticked the box, and when the hourly sweep settled it. */
CREATE TABLE IF NOT EXISTS public.checkout_starts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, product_id uuid REFERENCES public.products(id) ON DELETE CASCADE, variant_id uuid, product_title text, email text NOT NULL, first_name text, payment_intent_id text NOT NULL, email_opt_in boolean NOT NULL DEFAULT false, source_detail jsonb, created_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz, outcome text );
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_email_lower;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_email_lower CHECK (email = lower(email)) NOT VALID;
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_outcome_check;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_outcome_check CHECK (outcome IS NULL OR outcome IN ('bought', 'unsubscribed', 'no_consent', 'entered')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS checkout_starts_intent ON public.checkout_starts (payment_intent_id);
CREATE INDEX IF NOT EXISTS checkout_starts_due ON public.checkout_starts (created_at) WHERE handled_at IS NULL;
CREATE INDEX IF NOT EXISTS checkout_starts_contact ON public.checkout_starts (creator_id, email);

/* 4 of 4  A creator can read their own started checkouts. Nobody but the server writes them. */
ALTER TABLE public.checkout_starts ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.checkout_starts FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own started checkouts" ON public.checkout_starts;
CREATE POLICY "Creators read their own started checkouts" ON public.checkout_starts FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.checkout_starts TO service_role;

/* PostgREST answers from its own cached schema; without this the API keeps saying the new table does not exist. */
NOTIFY pgrst, 'reload schema';

/* Did it work? Every number should read 1. contact_unique reads 0 when two contacts already share an address in different case: merge those two rows by hand and run this again. */
SELECT (SELECT count(*) FROM pg_constraint WHERE conname = 'subscribers_status_check' AND pg_get_constraintdef(oid) LIKE '%customer%') AS customer_status, (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'subscribers_creator_email_lower') AS contact_unique, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkout_starts') AS checkout_starts, (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'checkout_starts_intent') AS one_start_per_payment;

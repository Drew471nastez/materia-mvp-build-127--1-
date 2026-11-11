/* OnePage data blocks, round AR, part 411 (run after 406): three things the live page now writes. public.onepage_tips holds one row per tip paid through Storelib checkout on a OnePage tips block (keyed on the Stripe Checkout Session, so the webhook and the buyer's return write it once; the money itself goes to the creator's connected account as every Storelib sale does). public.onepage_poll_votes holds one vote per visitor per poll (unique on page, block and the visitor's key), so a poll counts each person once and shows real totals. onepage_leads and subscribers gain a nullable phone column, for an email signup that asks for a phone number. Both new tables are read and written by the server only (row level security on, nothing granted to anon or authenticated, so a visitor can neither read the tips nor stuff votes). Before this part has run the page still works: a tip is still paid and confirmed from Stripe but kept nowhere else, a poll takes no votes and says so, and a phone number is left off. No rows change. Safe to run again. */
CREATE TABLE IF NOT EXISTS public.onepage_tips (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onepage_id uuid NOT NULL, block_id text NOT NULL, creator_id uuid NOT NULL, checkout_session_id text NOT NULL, payment_intent_id text, amount_cents integer NOT NULL CHECK (amount_cents > 0), currency text NOT NULL, platform_fee_cents integer, tipper_name text, tipper_email text, message text, status text NOT NULL DEFAULT 'paid', created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS onepage_tips_session_key ON public.onepage_tips (checkout_session_id);
CREATE INDEX IF NOT EXISTS onepage_tips_page_idx ON public.onepage_tips (onepage_id, created_at DESC);
CREATE INDEX IF NOT EXISTS onepage_tips_creator_idx ON public.onepage_tips (creator_id, created_at DESC);
ALTER TABLE public.onepage_tips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onepage_tips FROM anon, authenticated;
GRANT ALL ON TABLE public.onepage_tips TO service_role;
CREATE TABLE IF NOT EXISTS public.onepage_poll_votes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onepage_id uuid NOT NULL, block_id text NOT NULL, option_id text NOT NULL, voter_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS onepage_poll_votes_one_each ON public.onepage_poll_votes (onepage_id, block_id, voter_key);
CREATE INDEX IF NOT EXISTS onepage_poll_votes_block_idx ON public.onepage_poll_votes (onepage_id, block_id, option_id);
ALTER TABLE public.onepage_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onepage_poll_votes FROM anon, authenticated;
GRANT ALL ON TABLE public.onepage_poll_votes TO service_role;
DO $do$ BEGIN IF to_regclass('public.onepage_leads') IS NOT NULL THEN ALTER TABLE public.onepage_leads ADD COLUMN IF NOT EXISTS phone text; END IF; IF to_regclass('public.subscribers') IS NOT NULL THEN ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS phone text; END IF; END $do$;
notify pgrst, 'reload schema';

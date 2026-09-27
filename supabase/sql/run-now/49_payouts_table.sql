/* Payouts: the table every payout the creator is paid is written to. The Stripe webhook's payout events, Cash out and Withdraw all upsert into public.payouts (on stripe_payout_id), and the order timeline, the notifications and the admin console read it; production has no such table, so every one of those writes has been failing quietly (the upsert returns an error the code does not throw) and the admin console logs PGRST205. The table was written on 19 February (supabase/migrations/20260219_payouts_table.sql) and never ran. Same columns as that file, which match the upserts. Creators read their own rows; only the server writes. Adds one table, two indexes, a read policy and an updated_at trigger; changes no rows. Needs creators. */
CREATE TABLE IF NOT EXISTS public.payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, stripe_payout_id text NOT NULL UNIQUE, amount_cents integer NOT NULL, currency text NOT NULL DEFAULT 'usd', status text NOT NULL DEFAULT 'pending', arrival_date timestamptz, description text, destination text, method text, failure_code text, failure_message text, stripe_created timestamptz, webhook_received_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS payouts_creator_id_idx ON public.payouts (creator_id);
CREATE INDEX IF NOT EXISTS payouts_creator_created_idx ON public.payouts (creator_id, created_at DESC);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creators can view own payouts" ON public.payouts;
CREATE POLICY "creators can view own payouts" ON public.payouts FOR SELECT USING (creator_id IN (SELECT c.id FROM public.creators c WHERE c.user_id = (SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.payouts FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.update_payouts_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS set_payouts_updated_at ON public.payouts;
CREATE TRIGGER set_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_payouts_updated_at();
notify pgrst, 'reload schema';

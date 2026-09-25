/* ===========================================================================
   NOTIFICATIONS THAT DECIDE FOR THEMSELVES
   ===========================================================================
   The same statements as supabase/sql/run-now/XX_notification_rules.sql,
   which is the file to paste. One statement per line, safe to run twice.

   WHAT IT IS FOR. lib/notifications looks at every creator's real data every
   hour (app/api/cron/notifications) and straight after the webhooks that
   matter, and writes a row in seller_notifications when something is worth
   saying: a payout that failed, a domain without HTTPS, a product with no
   file, a first sale. Each thing is said once (its dedupe key), resolves
   itself when it is fixed, and only critical ones and milestones push.

   BEFORE THIS RUNS the claim function and the new columns are missing: the
   cron answers "not available" and writes nothing, the webhooks' calls do
   nothing, and the panel and its API read the rows they always read, as
   they always did. Nothing breaks.

   AFTER THIS RUNS the next hourly run evaluates every creator who finished
   onboarding, least recently evaluated first, as many as fit in its time,
   and the rest in the runs after.

   1. seller_notifications gets the columns a rule writes: kind, category,
      priority, dedupe_key, subject_id, rule_version, and when the row was
      resolved and pushed.
   2. Its type check also allows the six categories. Every check on type is
      replaced, whatever it was named; NOT VALID, so old rows are not read.
   3. The unique index that makes "said once" true under concurrent runs:
      (creator_id, dedupe_key). Older rows have no key; NULLs never clash.
      Two indexes for what the engine and the panel read.
   4. notification_creator_state: when each creator was last evaluated, and
      a lease so two runs never evaluate the same creator at once. Row level
      security on and no policies: the service role only.
   5. notification_claim_creators: gives new creators a row, then leases the
      least recently evaluated free ones with FOR UPDATE SKIP LOCKED. The
      service role only.
   =========================================================================== */

/* 1. What a rule writes on its row: kind, category, priority, dedupe key, subject, rule version, and when it was resolved and pushed. */
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS priority smallint;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS subject_id text;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS rule_version smallint;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.seller_notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

/* 2. The type takes the six categories beside the old kinds; every check on type, whatever it was named, is replaced. NOT VALID: rows already there are not rechecked. */
DO $$ DECLARE c record; BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.seller_notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%type%' LOOP EXECUTE format('ALTER TABLE public.seller_notifications DROP CONSTRAINT %I', c.conname); END LOOP; END $$;
ALTER TABLE public.seller_notifications ADD CONSTRAINT seller_notifications_type_check CHECK (type IN ('new_review', 'new_sale', 'new_subscriber', 'payout', 'announcement', 'critical', 'problem', 'next_step', 'opportunity', 'milestone', 'update')) NOT VALID;
ALTER TABLE public.seller_notifications DROP CONSTRAINT IF EXISTS seller_notifications_category_check;
ALTER TABLE public.seller_notifications ADD CONSTRAINT seller_notifications_category_check CHECK (category IS NULL OR category IN ('critical', 'problem', 'next_step', 'opportunity', 'milestone', 'update')) NOT VALID;

/* 3. Said once: one row per creator and dedupe key, which the engine writes ON CONFLICT DO NOTHING. Older rows have no key, and NULLs never clash. Then what the engine and the panel read by. */
CREATE UNIQUE INDEX IF NOT EXISTS seller_notifications_once ON public.seller_notifications (creator_id, dedupe_key);
CREATE INDEX IF NOT EXISTS seller_notifications_engine ON public.seller_notifications (creator_id, created_at) WHERE kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS seller_notifications_feed ON public.seller_notifications (user_id, created_at DESC) WHERE dismissed_at IS NULL AND resolved_at IS NULL;

/* 4. When each creator was last evaluated, and a lease so two runs never evaluate the same one at once. The server's alone. */
CREATE TABLE IF NOT EXISTS public.notification_creator_state ( creator_id uuid PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE, lease_until timestamptz, evaluated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS notification_creator_state_next ON public.notification_creator_state (evaluated_at ASC NULLS FIRST, creator_id);
ALTER TABLE public.notification_creator_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_creator_state FROM anon, authenticated;
GRANT ALL ON public.notification_creator_state TO service_role;

/* 5. The claim: creators who finished onboarding get a row, then the least recently evaluated free ones are leased, skipping any another run holds (FOR UPDATE SKIP LOCKED) and any evaluated in the last half hour. Run by the server only. */
CREATE OR REPLACE FUNCTION public.notification_claim_creators(p_limit integer, p_lease_seconds integer) RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$ INSERT INTO public.notification_creator_state (creator_id) SELECT c.id FROM public.creators c WHERE c.onboarding_completed IS TRUE AND NOT EXISTS (SELECT 1 FROM public.notification_creator_state s WHERE s.creator_id = c.id) ORDER BY c.created_at LIMIT 1000 ON CONFLICT (creator_id) DO NOTHING; UPDATE public.notification_creator_state AS s SET lease_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 30)) WHERE s.creator_id IN (SELECT q.creator_id FROM public.notification_creator_state q WHERE (q.lease_until IS NULL OR q.lease_until < now()) AND (q.evaluated_at IS NULL OR q.evaluated_at < now() - interval '30 minutes') ORDER BY q.evaluated_at ASC NULLS FIRST, q.creator_id LIMIT least(greatest(coalesce(p_limit, 25), 1), 200) FOR UPDATE SKIP LOCKED) RETURNING s.creator_id; $fn$;
REVOKE ALL ON FUNCTION public.notification_claim_creators(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_claim_creators(integer, integer) TO service_role;

/* PostgREST answers from its cached schema; without this the API keeps saying the new columns and function do not exist. */
NOTIFY pgrst, 'reload schema';

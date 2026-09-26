/* ===========================================================================
   THE NOTIFICATION ENGINE
   ===========================================================================
   The same statements as supabase/sql/run-now/40_notification_engine.sql,
   which is the file to paste. One statement per line, safe to run twice.

   WHAT IT IS FOR. lib/notify decides who hears about what, when and how.
   A business change raises a domain event (emit() in lib/notify/outbox.ts,
   or a trigger here, in the same transaction as the change); the worker
   (lib/notify/worker.ts, /api/cron/notify every five minutes) turns events
   into jobs, and due jobs into an email through Mailgun and a row in the
   bell, after checking again what is true now, the person's preferences,
   the suppression list, cooldowns and daily caps.

   BEFORE THIS RUNS the tables and functions are missing: emit() answers
   ok: false, the cron answers available: false, the Mailgun webhook handles
   lists and campaigns as it always did, and the bell reads what it always
   read. Nothing breaks.

    1. notification_events, the outbox, unique by event_key.
    2. notification_jobs, unique by idempotency_key; run_at for delayed jobs,
       expires_at, attempts and a lease.
    3. notification_deliveries, one per job and channel, written in
       "sending" before the provider is called.
    4. notification_preferences: readable by their owner, written by the
       server.
    5. email_suppressions and mailgun_webhook_events.
    6. seller_notifications.expires_at. The engine's bell rows use the type
       values the check already allows, with the notification type as kind,
       so the type check is left as part 29 made it.
    7. Row level security on everything; the service role only, except a
       person reading their own preferences.
    8. claim_notification_events and claim_notification_jobs: FOR UPDATE
       SKIP LOCKED with a lease, the service role only.
    9. notify_outbox_insert: the insert every trigger makes, ON CONFLICT DO
       NOTHING, and a warning rather than an error if it fails, so a
       notification can never stop a product from saving or a payment
       account from updating.
   10. to 13. The triggers on products, creators, custom_domains and, when
       this role may, auth.users.
   =========================================================================== */

/* 1. The outbox: one row per domain event, unique by its key, so the same event raised twice (a Stripe retry, a trigger and a route) is one row. Processed by the worker, retried with a lease until attempts run out. */
CREATE TABLE IF NOT EXISTS public.notification_events ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL, name text NOT NULL, user_id uuid, creator_id uuid, entity_type text, entity_id text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, source text NOT NULL DEFAULT 'app', correlation_id text, occurred_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, attempts integer NOT NULL DEFAULT 0, claimed_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT notification_events_key UNIQUE (event_key) );
CREATE INDEX IF NOT EXISTS notification_events_unprocessed ON public.notification_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS notification_events_creator ON public.notification_events (creator_id, created_at DESC);

/* 2. The jobs: one per planned notification, unique by recipient, type, entity and step. A delayed job is a row with a later run_at; nothing waits in memory. */
CREATE TABLE IF NOT EXISTS public.notification_jobs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL, type text NOT NULL, recipient_type text NOT NULL, recipient_user_id uuid, recipient_email text, creator_id uuid, entity_type text, entity_id text, idempotency_key text NOT NULL, workflow text, step text, condition text, state text NOT NULL DEFAULT 'pending', skip_reason text, run_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, claimed_by text, claimed_until timestamptz, last_error text, data jsonb NOT NULL DEFAULT '{}'::jsonb, correlation_id text, sent_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT notification_jobs_once UNIQUE (idempotency_key) );
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_state_check;
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_state_check CHECK (state IN ('pending', 'processing', 'sent', 'skipped', 'cancelled', 'failed')) NOT VALID;
ALTER TABLE public.notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_recipient_type_check;
ALTER TABLE public.notification_jobs ADD CONSTRAINT notification_jobs_recipient_type_check CHECK (recipient_type IN ('creator', 'customer', 'team_member', 'admin')) NOT VALID;
CREATE INDEX IF NOT EXISTS notification_jobs_due ON public.notification_jobs (state, run_at);
CREATE INDEX IF NOT EXISTS notification_jobs_leased ON public.notification_jobs (claimed_until) WHERE state = 'processing';
CREATE INDEX IF NOT EXISTS notification_jobs_expiring ON public.notification_jobs (expires_at) WHERE state = 'pending' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_jobs_workflow ON public.notification_jobs (workflow, recipient_user_id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS notification_jobs_sent_to_user ON public.notification_jobs (type, recipient_user_id, entity_id, sent_at DESC) WHERE state = 'sent';
CREATE INDEX IF NOT EXISTS notification_jobs_sent_to_email ON public.notification_jobs (type, recipient_email, entity_id, sent_at DESC) WHERE state = 'sent';
CREATE INDEX IF NOT EXISTS notification_jobs_event ON public.notification_jobs (event_id);
CREATE INDEX IF NOT EXISTS notification_jobs_creator ON public.notification_jobs (creator_id, created_at DESC);

/* 3. The deliveries: one per job and channel, written in sending before the provider is called, so a worker that dies mid-send leaves a row that says so and the email is never sent again blindly. The Mailgun webhook moves it on by its id or its message id. */
CREATE TABLE IF NOT EXISTS public.notification_deliveries ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.notification_jobs(id) ON DELETE CASCADE, channel text NOT NULL, provider text, provider_message_id text, status text NOT NULL DEFAULT 'sending', attempt_count integer NOT NULL DEFAULT 0, type text NOT NULL, category text, requirement text, recipient_email text, recipient_user_id uuid, correlation_id text, skip_reason text, failure_reason text, sent_at timestamptz, delivered_at timestamptz, failed_at timestamptz, opened_at timestamptz, clicked_at timestamptz, complained_at timestamptz, unsubscribed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT notification_deliveries_once UNIQUE (job_id, channel) );
ALTER TABLE public.notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_status_check CHECK (status IN ('sending', 'sent', 'retry', 'failed', 'unknown', 'skipped', 'delivered', 'bounced', 'complained', 'unsubscribed')) NOT VALID;
ALTER TABLE public.notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email', 'in_app', 'push', 'sms')) NOT VALID;
CREATE INDEX IF NOT EXISTS notification_deliveries_provider_message ON public.notification_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_deliveries_recent_email ON public.notification_deliveries (recipient_email, created_at DESC) WHERE channel = 'email';
CREATE INDEX IF NOT EXISTS notification_deliveries_user ON public.notification_deliveries (recipient_user_id, created_at DESC);

/* 4. Preferences: one row per person, category and channel; no row means the default. The person reads their own rows; every write goes through the server. */
CREATE TABLE IF NOT EXISTS public.notification_preferences ( user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, category text NOT NULL, channel text NOT NULL, enabled boolean NOT NULL, source text NOT NULL DEFAULT 'settings', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, category, channel) );
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_category_check CHECK (category IN ('sales', 'payouts_and_payments', 'product_and_store', 'account', 'security', 'lifecycle', 'tips', 'marketing')) NOT VALID;
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_channel_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_channel_check CHECK (channel IN ('email', 'in_app', 'push', 'sms')) NOT VALID;
ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_source_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_source_check CHECK (source IN ('settings', 'unsubscribe_link', 'mailgun', 'admin')) NOT VALID;

/* 5. Addresses not to email: all for a hard bounce, optional for a complaint or an unsubscribe. Stored lower case. The webhook ids already handled, so a retried delivery changes nothing twice. */
CREATE TABLE IF NOT EXISTS public.email_suppressions ( email text NOT NULL, scope text NOT NULL, reason text, source text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), lifted_at timestamptz, PRIMARY KEY (email, scope) );
ALTER TABLE public.email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_scope_check;
ALTER TABLE public.email_suppressions ADD CONSTRAINT email_suppressions_scope_check CHECK (scope IN ('all', 'optional') AND email = lower(email)) NOT VALID;
CREATE TABLE IF NOT EXISTS public.mailgun_webhook_events ( id text PRIMARY KEY, event text, received_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS mailgun_webhook_events_received ON public.mailgun_webhook_events (received_at);

/* 6. The bell: the engine writes its rows into seller_notifications with a type the check already allows and its notification type as the kind, so only an expiry is added. */
ALTER TABLE IF EXISTS public.seller_notifications ADD COLUMN IF NOT EXISTS expires_at timestamptz;
DO $$ BEGIN IF to_regclass('public.seller_notifications') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS seller_notifications_expiring ON public.seller_notifications (expires_at) WHERE expires_at IS NOT NULL; END IF; END $$;

/* 7. Server only, except that a person may read their own preferences. */
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailgun_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_events FROM anon, authenticated;
REVOKE ALL ON public.notification_jobs FROM anon, authenticated;
REVOKE ALL ON public.notification_deliveries FROM anon, authenticated;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;
REVOKE ALL ON public.mailgun_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.notification_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.notification_preferences FROM authenticated;
GRANT SELECT ON public.notification_preferences TO authenticated;
DROP POLICY IF EXISTS "People read their own notification preferences" ON public.notification_preferences;
CREATE POLICY "People read their own notification preferences" ON public.notification_preferences FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT ALL ON public.notification_events TO service_role;
GRANT ALL ON public.notification_jobs TO service_role;
GRANT ALL ON public.notification_deliveries TO service_role;
GRANT ALL ON public.email_suppressions TO service_role;
GRANT ALL ON public.mailgun_webhook_events TO service_role;
GRANT ALL ON public.notification_preferences TO service_role;

/* 8. The claims. Events: unprocessed ones no other run holds, oldest first, leased. Jobs: pending ones past expiry are skipped as EXPIRED first, then due pending ones and ones whose lease ran out (a worker that died) are leased to this worker with FOR UPDATE SKIP LOCKED and their attempt counted. Run by the server only. */
CREATE OR REPLACE FUNCTION public.claim_notification_events(p_limit integer DEFAULT 20, p_lease_seconds integer DEFAULT 60) RETURNS SETOF public.notification_events LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$ UPDATE public.notification_events e SET claimed_until = now() + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 60), 900))), attempts = e.attempts + 1 WHERE e.id IN (SELECT q.id FROM public.notification_events q WHERE q.processed_at IS NULL AND (q.claimed_until IS NULL OR q.claimed_until < now()) AND q.attempts < 10 ORDER BY q.created_at LIMIT greatest(1, least(coalesce(p_limit, 20), 100)) FOR UPDATE SKIP LOCKED) RETURNING e.*; $fn$;
REVOKE ALL ON FUNCTION public.claim_notification_events(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_events(integer, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_notification_jobs(p_worker text, p_limit integer DEFAULT 20, p_lease_seconds integer DEFAULT 120) RETURNS SETOF public.notification_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$ UPDATE public.notification_jobs x SET state = 'skipped', skip_reason = 'EXPIRED', claimed_by = NULL, claimed_until = NULL, finished_at = now(), updated_at = now() WHERE x.state = 'pending' AND x.expires_at IS NOT NULL AND x.expires_at <= now(); UPDATE public.notification_jobs j SET state = 'processing', claimed_by = p_worker, claimed_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))), attempts = j.attempts + 1, updated_at = now() WHERE j.id IN (SELECT q.id FROM public.notification_jobs q WHERE ((q.state = 'pending' AND q.run_at <= now()) OR (q.state = 'processing' AND q.claimed_until < now())) AND (q.expires_at IS NULL OR q.expires_at > now()) ORDER BY q.run_at LIMIT greatest(1, least(coalesce(p_limit, 20), 100)) FOR UPDATE SKIP LOCKED) RETURNING j.*; $fn$;
REVOKE ALL ON FUNCTION public.claim_notification_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_jobs(text, integer, integer) TO service_role;

/* 9. The outbox from inside the database: a row in notification_events, keyed so a duplicate fire is one row, and never an error. A failure is a warning in the log and the business write goes on. The stamp in a key is the row's updated_at when this change moved it, else the transaction's time, so a real second publish later is a new event and a repeated fire is not. */
CREATE OR REPLACE FUNCTION public.notify_outbox_insert(p_name text, p_key text, p_user uuid, p_creator uuid, p_entity_type text, p_entity_id text, p_payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN INSERT INTO public.notification_events (event_key, name, user_id, creator_id, entity_type, entity_id, payload, source, correlation_id) VALUES (left(p_key, 500), p_name, p_user, p_creator, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb), 'trigger', gen_random_uuid()::text) ON CONFLICT (event_key) DO NOTHING; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification event % not recorded (%)', p_name, SQLSTATE; END $fn$;
REVOKE ALL ON FUNCTION public.notify_outbox_insert(text, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.notify_stamp(o jsonb, n jsonb) RETURNS text LANGUAGE sql STABLE SET search_path = public AS $fn$ SELECT CASE WHEN n ->> 'updated_at' IS NOT NULL AND (o IS NULL OR (o ->> 'updated_at') IS DISTINCT FROM (n ->> 'updated_at')) THEN floor(extract(epoch FROM (n ->> 'updated_at')::timestamptz) * 1000000)::bigint::text ELSE floor(extract(epoch FROM now()) * 1000000)::bigint::text END $fn$;
REVOKE ALL ON FUNCTION public.notify_stamp(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

/* 10. Products are written from the browser, so their events come from here: product.created on insert; product.published when the status moves into published, and product.first_published (once per creator, ever) when no other product of theirs is published; product.deleted on delete or when it is archived. Columns are read through to_jsonb, so a column a database lacks is a null, not an error. */
CREATE OR REPLACE FUNCTION public.notify_products_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ DECLARE n jsonb; o jsonb; v_id text; v_creator uuid; v_user uuid; v_stamp text; v_payload jsonb; v_ready boolean; BEGIN BEGIN IF TG_OP <> 'DELETE' THEN n := to_jsonb(NEW); END IF; IF TG_OP <> 'INSERT' THEN o := to_jsonb(OLD); END IF; v_id := coalesce(n ->> 'id', o ->> 'id'); v_creator := nullif(coalesce(n ->> 'creator_id', o ->> 'creator_id'), '')::uuid; SELECT c.user_id INTO v_user FROM public.creators c WHERE c.id = v_creator; v_stamp := public.notify_stamp(o, n); v_payload := jsonb_build_object('productId', v_id, 'productTitle', left(coalesce(n ->> 'title', o ->> 'title', ''), 200), 'status', coalesce(n ->> 'status', o ->> 'status')); IF TG_OP = 'INSERT' THEN PERFORM public.notify_outbox_insert('product.created', 'product.created:' || v_id, v_user, v_creator, 'product', v_id, v_payload); END IF; IF TG_OP <> 'DELETE' AND n ->> 'status' = 'published' AND (o IS NULL OR (o ->> 'status') IS DISTINCT FROM 'published') THEN PERFORM public.notify_outbox_insert('product.published', 'product.published:' || v_id || ':' || v_stamp, v_user, v_creator, 'product', v_id, v_payload); IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.creator_id = v_creator AND p.id::text <> v_id AND p.status = 'published') THEN SELECT coalesce(to_jsonb(c) ->> 'charges_enabled', 'false') = 'true' INTO v_ready FROM public.creators c WHERE c.id = v_creator; PERFORM public.notify_outbox_insert('product.first_published', 'product.first_published:' || v_creator::text, v_user, v_creator, 'product', v_id, v_payload || jsonb_build_object('paymentsReady', coalesce(v_ready, false))); END IF; END IF; IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND ((n ->> 'status' = 'archived' AND (o ->> 'status') IS DISTINCT FROM 'archived') OR (coalesce(n ->> 'archived', 'false') = 'true' AND coalesce(o ->> 'archived', 'false') <> 'true'))) THEN PERFORM public.notify_outbox_insert('product.deleted', 'product.deleted:' || v_id || ':' || v_stamp, v_user, v_creator, 'product', v_id, v_payload); END IF; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification trigger on products skipped (%)', SQLSTATE; END; RETURN NULL; END $fn$;
REVOKE ALL ON FUNCTION public.notify_products_outbox() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF to_regclass('public.products') IS NOT NULL THEN DROP TRIGGER IF EXISTS notify_products_outbox ON public.products; CREATE TRIGGER notify_products_outbox AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.notify_products_outbox(); END IF; END $$;

/* 11. Creators: store.created on insert; the Stripe Connect fields moving to connected (payment_setup.completed), away from it (payment_setup.action_required), a Stripe account first saved (payment_setup.started), a rejected or restricted status (payment_setup.failed); banned_at set or cleared (account.restricted, account.restriction_removed). */
CREATE OR REPLACE FUNCTION public.notify_creators_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ DECLARE n jsonb; o jsonb; v_id text; v_user uuid; v_stamp text; v_new boolean; v_old boolean; v_base jsonb; BEGIN BEGIN n := to_jsonb(NEW); IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD); END IF; v_id := n ->> 'id'; v_user := nullif(n ->> 'user_id', '')::uuid; v_stamp := public.notify_stamp(o, n); v_base := jsonb_build_object('creatorId', v_id, 'storeName', left(coalesce(n ->> 'display_name', n ->> 'username', ''), 120)); IF TG_OP = 'INSERT' THEN PERFORM public.notify_outbox_insert('store.created', 'store.created:' || v_id, v_user, v_id::uuid, 'creator', v_id, v_base); RETURN NULL; END IF; v_new := coalesce(n ->> 'stripe_onboarding_status', '') = 'connected' OR (coalesce(n ->> 'charges_enabled', '') = 'true' AND coalesce(n ->> 'payouts_enabled', '') = 'true' AND coalesce(n ->> 'details_submitted', '') = 'true'); v_old := coalesce(o ->> 'stripe_onboarding_status', '') = 'connected' OR (coalesce(o ->> 'charges_enabled', '') = 'true' AND coalesce(o ->> 'payouts_enabled', '') = 'true' AND coalesce(o ->> 'details_submitted', '') = 'true'); IF (o ->> 'stripe_account_id') IS NULL AND (n ->> 'stripe_account_id') IS NOT NULL THEN PERFORM public.notify_outbox_insert('payment_setup.started', 'payment_setup.started:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'payment_setup', v_id, v_base); END IF; IF v_new AND NOT v_old THEN PERFORM public.notify_outbox_insert('payment_setup.completed', 'payment_setup.completed:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'payment_setup', v_id, v_base); ELSIF v_old AND NOT v_new AND (n ->> 'stripe_account_id') IS NOT NULL THEN PERFORM public.notify_outbox_insert('payment_setup.action_required', 'payment_setup.action_required:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'payment_setup', v_id, v_base || jsonb_build_object('chargesEnabled', coalesce(n ->> 'charges_enabled', '') = 'true', 'payoutsEnabled', coalesce(n ->> 'payouts_enabled', '') = 'true')); END IF; IF coalesce(n ->> 'stripe_onboarding_status', '') IN ('rejected', 'failed', 'restricted') AND (o ->> 'stripe_onboarding_status') IS DISTINCT FROM (n ->> 'stripe_onboarding_status') THEN PERFORM public.notify_outbox_insert('payment_setup.failed', 'payment_setup.failed:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'payment_setup', v_id, v_base || jsonb_build_object('reason', n ->> 'stripe_onboarding_status')); END IF; IF (o ->> 'banned_at') IS NULL AND (n ->> 'banned_at') IS NOT NULL THEN PERFORM public.notify_outbox_insert('account.restricted', 'account.restricted:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'creator', v_id, v_base); ELSIF (o ->> 'banned_at') IS NOT NULL AND (n ->> 'banned_at') IS NULL THEN PERFORM public.notify_outbox_insert('account.restriction_removed', 'account.restriction_removed:' || v_id || ':' || v_stamp, v_user, v_id::uuid, 'creator', v_id, v_base); END IF; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification trigger on creators skipped (%)', SQLSTATE; END; RETURN NULL; END $fn$;
REVOKE ALL ON FUNCTION public.notify_creators_outbox() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF to_regclass('public.creators') IS NOT NULL THEN DROP TRIGGER IF EXISTS notify_creators_outbox ON public.creators; CREATE TRIGGER notify_creators_outbox AFTER INSERT OR UPDATE ON public.creators FOR EACH ROW EXECUTE FUNCTION public.notify_creators_outbox(); END IF; END $$;

/* 12. Connected domains: the status moving to active (domain.connected), or the status or the certificate moving to failed (domain.connection_failed). */
CREATE OR REPLACE FUNCTION public.notify_domains_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ DECLARE n jsonb; o jsonb; v_id text; v_creator uuid; v_user uuid; v_stamp text; v_payload jsonb; BEGIN BEGIN n := to_jsonb(NEW); IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD); END IF; v_id := n ->> 'id'; v_creator := nullif(n ->> 'creator_id', '')::uuid; SELECT c.user_id INTO v_user FROM public.creators c WHERE c.id = v_creator; v_stamp := public.notify_stamp(o, n); v_payload := jsonb_build_object('domainId', v_id, 'domain', left(coalesce(n ->> 'domain', ''), 253)); IF n ->> 'status' = 'active' AND (o IS NULL OR (o ->> 'status') IS DISTINCT FROM 'active') THEN PERFORM public.notify_outbox_insert('domain.connected', 'domain.connected:' || v_id || ':' || v_stamp, v_user, v_creator, 'domain', v_id, v_payload); END IF; IF (n ->> 'status' = 'failed' AND (o IS NULL OR (o ->> 'status') IS DISTINCT FROM 'failed')) OR (n ->> 'ssl_status' = 'failed' AND (o IS NULL OR (o ->> 'ssl_status') IS DISTINCT FROM 'failed')) THEN PERFORM public.notify_outbox_insert('domain.connection_failed', 'domain.connection_failed:' || v_id || ':' || v_stamp, v_user, v_creator, 'domain', v_id, v_payload); END IF; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification trigger on custom_domains skipped (%)', SQLSTATE; END; RETURN NULL; END $fn$;
REVOKE ALL ON FUNCTION public.notify_domains_outbox() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF to_regclass('public.custom_domains') IS NOT NULL THEN DROP TRIGGER IF EXISTS notify_domains_outbox ON public.custom_domains; CREATE TRIGGER notify_domains_outbox AFTER INSERT OR UPDATE ON public.custom_domains FOR EACH ROW EXECUTE FUNCTION public.notify_domains_outbox(); END IF; END $$;

/* 13. Supabase Auth: a password that changed (user.password_changed, keyed by the user and updated_at in seconds, as the app route keys it, so the two are one event) and an email that changed (user.email_changed, with the old and the new address). Created only when this role may add a trigger to auth.users; otherwise a notice, and those events come from the app routes alone. */
CREATE OR REPLACE FUNCTION public.notify_auth_users_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ DECLARE v_creator uuid; v_epoch text; BEGIN BEGIN v_epoch := floor(extract(epoch FROM coalesce(NEW.updated_at, now())))::bigint::text; SELECT c.id INTO v_creator FROM public.creators c WHERE c.user_id = NEW.id LIMIT 1; IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password AND coalesce(OLD.encrypted_password, '') <> '' THEN PERFORM public.notify_outbox_insert('user.password_changed', 'user.password_changed:' || NEW.id::text || ':' || v_epoch, NEW.id, v_creator, 'user', NEW.id::text, jsonb_build_object('userId', NEW.id)); END IF; IF NEW.email IS DISTINCT FROM OLD.email AND OLD.email IS NOT NULL THEN PERFORM public.notify_outbox_insert('user.email_changed', 'user.email_changed:' || NEW.id::text || ':' || v_epoch, NEW.id, v_creator, 'user', NEW.id::text, jsonb_build_object('userId', NEW.id, 'previousEmail', OLD.email, 'newEmail', NEW.email)); END IF; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notification trigger on auth.users skipped (%)', SQLSTATE; END; RETURN NULL; END $fn$;
REVOKE ALL ON FUNCTION public.notify_auth_users_outbox() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF to_regclass('auth.users') IS NULL THEN RAISE NOTICE 'auth.users not found: password and email change events come from the app routes only'; ELSIF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notify_auth_users_outbox' AND tgrelid = 'auth.users'::regclass AND NOT tgisinternal) THEN RAISE NOTICE 'auth.users trigger already in place'; ELSIF NOT has_table_privilege('auth.users', 'TRIGGER') THEN RAISE NOTICE 'auth.users trigger skipped: this role may not add triggers there, so password and email change events come from the app routes only'; ELSE CREATE TRIGGER notify_auth_users_outbox AFTER UPDATE OF encrypted_password, email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.notify_auth_users_outbox(); END IF; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'auth.users trigger skipped: not permitted for this role, so password and email change events come from the app routes only'; END $$;

/* PostgREST answers from its cached schema; without this the API keeps saying the new tables and functions do not exist. */
NOTIFY pgrst, 'reload schema';

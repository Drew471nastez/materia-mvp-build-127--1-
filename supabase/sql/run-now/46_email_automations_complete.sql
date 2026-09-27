/* Emails and automations, complete: everything the Emails page, the email composer, the automation builder and the engine read and write, in one part. The contacts (subscribers) with every column the app writes, segments, campaigns with their send bookkeeping, one row per address sent, open and click events, the monthly count, the automations (email_flows) and the older delayed email queue, the engine's runs, jobs and sends with its five functions, started checkouts for the checkout reminder, contact form messages, the rate limit table the test and preview routes count in, and the email-images bucket. Safe on a database that ran none, some or all of parts 09, 10, 13, 21 and 30: every table is created only when missing, every column added only when missing, every check dropped and made again NOT VALID (new rows are checked, old ones are left alone), every unique index made only when no rows break it (a warning names the query to look at otherwise), every policy dropped and made again, every function replaced. Running it twice changes nothing. It deletes no row and changes no row, apart from giving a contact with no unsubscribe token one. The layouts a new email starts from and the automation templates live in the app (lib/email-campaigns/starters.ts, lib/automations/templates.ts), so there is nothing to seed. Needs creators, products, orders and profiles, which every Storelib database has. */

/* 0. What this part stands on. */
DO $$ BEGIN IF to_regclass('public.creators') IS NULL OR to_regclass('public.products') IS NULL OR to_regclass('public.orders') IS NULL THEN RAISE EXCEPTION 'public.creators, public.products and public.orders must exist before this part: run the core schema first'; END IF; END $$;

/* One function stamps updated_at on the email tables that have one. Its own name, so no other table's trigger changes. */
CREATE OR REPLACE FUNCTION public.email_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.email_touch_updated_at() FROM PUBLIC;

/* 1. Contacts. One row per creator and address: somebody who joined the list (subscribed), a buyer who did not ask for news (customer), somebody who wrote through a contact form (wrote), or somebody who left or bounced. */
CREATE TABLE IF NOT EXISTS public.subscribers ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, source text, source_id uuid, source_detail jsonb, status text DEFAULT 'subscribed', is_active boolean DEFAULT true, consent_text text, consent_timestamp timestamptz DEFAULT now(), unsubscribe_token uuid DEFAULT gen_random_uuid(), tags text[] DEFAULT '{}', metadata jsonb DEFAULT '{}'::jsonb, subscribed_at timestamptz DEFAULT now(), unsubscribed_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source_detail jsonb;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS status text DEFAULT 'subscribed';
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS consent_text text;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS consent_timestamp timestamptz DEFAULT now();
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS subscribed_at timestamptz DEFAULT now();
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
/* Every unsubscribe link is the contact's token, so every contact has one. The only rows this part writes. */
UPDATE public.subscribers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;
ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_status_check;
ALTER TABLE public.subscribers ADD CONSTRAINT subscribers_status_check CHECK (status IS NULL OR status IN ('subscribed', 'unsubscribed', 'bounced', 'complained', 'cleaned', 'customer', 'wrote')) NOT VALID;
/* The app names where a contact came from in words it adds to over time ('checkout', 'contact_form', 'profile' and more), so the old two-value list on source is taken off rather than kept in step. */
ALTER TABLE public.subscribers DROP CONSTRAINT IF EXISTS subscribers_source_check;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.subscribers GROUP BY creator_id, lower(email) HAVING count(*) > 1) THEN RAISE WARNING 'subscribers: some creator has the same address twice (in different case), so the one contact per address index was not made. See them with: select creator_id, lower(email), count(*) from public.subscribers group by 1, 2 having count(*) > 1;'; ELSE CREATE UNIQUE INDEX IF NOT EXISTS subscribers_creator_email_lower ON public.subscribers (creator_id, lower(email)); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_id ON public.subscribers (creator_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_status ON public.subscribers (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON public.subscribers (unsubscribe_token);
CREATE INDEX IF NOT EXISTS subscribers_creator_subscribed_at ON public.subscribers (creator_id, subscribed_at DESC);
DROP TRIGGER IF EXISTS subscribers_touch_updated_at ON public.subscribers;
CREATE TRIGGER subscribers_touch_updated_at BEFORE UPDATE ON public.subscribers FOR EACH ROW EXECUTE FUNCTION public.email_touch_updated_at();
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
/* Sign-ups arrive through the server (app/api/subscribe and the others use the service role), so the old "anyone can insert" policies, which let anybody with the public key write a contact onto any creator's list, go. A creator reads and edits their own. */
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;
DROP POLICY IF EXISTS "Anyone can subscribe via public forms" ON public.subscribers;
DROP POLICY IF EXISTS "Creators can view their subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Creators can view their own subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Creators can insert their own subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Creators can update their own subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Creators can delete their own subscribers" ON public.subscribers;
CREATE POLICY "Creators can view their own subscribers" ON public.subscribers FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Creators can insert their own subscribers" ON public.subscribers FOR INSERT TO authenticated WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Creators can update their own subscribers" ON public.subscribers FOR UPDATE TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid()))) WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Creators can delete their own subscribers" ON public.subscribers FOR DELETE TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.subscribers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;
GRANT ALL ON public.subscribers TO service_role;

/* 2. Segments: a saved audience a campaign can go to. */
CREATE TABLE IF NOT EXISTS public.email_segments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, name text NOT NULL, description text, filters jsonb NOT NULL DEFAULT '{}'::jsonb, subscriber_count integer DEFAULT 0, is_default boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now() );
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS filters jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS subscriber_count integer DEFAULT 0;
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.email_segments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_email_segments_creator_id ON public.email_segments (creator_id);
DROP TRIGGER IF EXISTS email_segments_touch_updated_at ON public.email_segments;
CREATE TRIGGER email_segments_touch_updated_at BEFORE UPDATE ON public.email_segments FOR EACH ROW EXECUTE FUNCTION public.email_touch_updated_at();
ALTER TABLE public.email_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators manage their own segments" ON public.email_segments;
CREATE POLICY "Creators manage their own segments" ON public.email_segments FOR ALL TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid()))) WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.email_segments FROM anon;
GRANT ALL ON public.email_segments TO service_role;

/* 3. Campaigns: an email written in the composer, its audience, and where its send is. */
CREATE TABLE IF NOT EXISTS public.email_campaigns ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', preview_text text, from_name text, reply_to text, status text NOT NULL DEFAULT 'draft', audience_type text NOT NULL DEFAULT 'all', segment_id uuid REFERENCES public.email_segments(id) ON DELETE SET NULL, audience_count integer DEFAULT 0, scheduled_at timestamptz, sent_at timestamptz, completed_at timestamptz, last_error text, send_idempotency_key text, track_opens boolean NOT NULL DEFAULT true, rendered_html text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS preview_text text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS reply_to text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS audience_type text DEFAULT 'all';
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.email_segments(id) ON DELETE SET NULL;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS audience_count integer DEFAULT 0;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS send_idempotency_key text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS track_opens boolean NOT NULL DEFAULT true;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS rendered_html text;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')) NOT VALID;
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_type_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_audience_type_check CHECK (audience_type IN ('all', 'subscribers', 'customers', 'onepage', 'store_builder', 'segment', 'last_24h', 'last_7days', 'last_30days', 'last_90days')) NOT VALID;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.email_campaigns WHERE send_idempotency_key IS NOT NULL GROUP BY creator_id, send_idempotency_key HAVING count(*) > 1) THEN RAISE WARNING 'email_campaigns: a send key is used twice, so the send once index was not made. See them with: select creator_id, send_idempotency_key, count(*) from public.email_campaigns where send_idempotency_key is not null group by 1, 2 having count(*) > 1;'; ELSE CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_send_once ON public.email_campaigns (creator_id, send_idempotency_key) WHERE send_idempotency_key IS NOT NULL; END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator ON public.email_campaigns (creator_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_creator_status ON public.email_campaigns (creator_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON public.email_campaigns (sent_at DESC);
CREATE INDEX IF NOT EXISTS email_campaigns_due ON public.email_campaigns (status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_campaigns_active ON public.email_campaigns (status, updated_at);
/* The sending lease is the campaign's updated_at, so every update moves it, to the microsecond. */
CREATE OR REPLACE FUNCTION public.update_email_campaigns_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.update_email_campaigns_updated_at() FROM PUBLIC;
DROP TRIGGER IF EXISTS email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_email_campaigns_updated_at();
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
/* Saving, scheduling and sending all go through the server, which checks the body, the audience and the version (app/api/email). From the browser a creator reads their own emails and deletes one that is not being sent; they cannot mark one sent or change one mid-send. */
DROP POLICY IF EXISTS "Users can manage their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Creators can view their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Creators can insert their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Creators can update their own campaigns" ON public.email_campaigns;
DROP POLICY IF EXISTS "Creators can delete their own campaigns" ON public.email_campaigns;
CREATE POLICY "Creators can view their own campaigns" ON public.email_campaigns FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Creators can delete their own campaigns" ON public.email_campaigns FOR DELETE TO authenticated USING (status NOT IN ('queued', 'sending') AND creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.email_campaigns FROM anon;
REVOKE INSERT, UPDATE ON public.email_campaigns FROM authenticated;
GRANT SELECT, DELETE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;

/* 4. One row per address a campaign goes to: claimed before its send, retried with a wait, then what happened to it. */
CREATE TABLE IF NOT EXISTS public.campaign_recipients ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL, email text NOT NULL, name text, tracking_token uuid NOT NULL DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz, claimed_at timestamptz, sent_at timestamptz, delivered_at timestamptz, bounced_at timestamptz, opened_at timestamptz, clicked_at timestamptz, open_count integer DEFAULT 0, click_count integer DEFAULT 0, provider_message_id text, error_message text, created_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS open_count integer DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS click_count integer DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT campaign_recipients_status_check CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped', 'unknown')) NOT VALID;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.campaign_recipients GROUP BY campaign_id, email HAVING count(*) > 1) THEN RAISE WARNING 'campaign_recipients: an address appears twice in one campaign, so the one row per address index was not made. See them with: select campaign_id, email, count(*) from public.campaign_recipients group by 1, 2 having count(*) > 1;'; ELSE CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipients_unique ON public.campaign_recipients (campaign_id, email); END IF; END $$;
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON public.campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_creator ON public.campaign_recipients (creator_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON public.campaign_recipients (email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_token ON public.campaign_recipients (tracking_token);
CREATE INDEX IF NOT EXISTS campaign_recipients_queue ON public.campaign_recipients (campaign_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS campaign_recipients_month ON public.campaign_recipients (creator_id, created_at);
CREATE INDEX IF NOT EXISTS campaign_recipients_message ON public.campaign_recipients (provider_message_id);
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators read their own recipients" ON public.campaign_recipients;
CREATE POLICY "Creators read their own recipients" ON public.campaign_recipients FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.campaign_recipients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.campaign_recipients FROM authenticated;
GRANT SELECT ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;

/* 5. What happened to a campaign's email after it left: opens, clicks, bounces, unsubscribes. Written by the server only (the pixel, the click redirect, the Mailgun webhook). */
CREATE TABLE IF NOT EXISTS public.email_events ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE CASCADE, recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE, creator_id uuid REFERENCES public.creators(id) ON DELETE CASCADE, email text, event_type text NOT NULL, url text, user_agent text, ip_address text, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators(id) ON DELETE CASCADE;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
/* An event about an automated email has no campaign, older rows have no creator, and the oldest shape of this table named the address recipient_email and required it. The app writes email, so none of them may refuse a row. */
ALTER TABLE public.email_events ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE public.email_events ALTER COLUMN campaign_id DROP NOT NULL;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_events' AND column_name = 'recipient_email' AND is_nullable = 'NO') THEN ALTER TABLE public.email_events ALTER COLUMN recipient_email DROP NOT NULL; END IF; END $$;
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_event_type_check;
ALTER TABLE public.email_events ADD CONSTRAINT email_events_event_type_check CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'complained')) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON public.email_events (campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON public.email_events (recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_events_creator ON public.email_events (creator_id);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON public.email_events (email);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON public.email_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_type ON public.email_events (campaign_id, event_type);
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert events via tracking" ON public.email_events;
DROP POLICY IF EXISTS "Creators read their own email events" ON public.email_events;
CREATE POLICY "Creators read their own email events" ON public.email_events FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.email_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.email_events FROM authenticated;
GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;

/* 6. The month's count of emails sent, per creator, against the plan's allowance. Counted by the server. */
CREATE TABLE IF NOT EXISTS public.email_usage ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, month_year text NOT NULL, emails_sent integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_usage ADD COLUMN IF NOT EXISTS emails_sent integer NOT NULL DEFAULT 0;
ALTER TABLE public.email_usage ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_usage ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = 'public.email_usage'::regclass AND i.indisunique AND i.indpred IS NULL AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = ARRAY['creator_id', 'month_year']) THEN RETURN; END IF; IF EXISTS (SELECT 1 FROM public.email_usage GROUP BY creator_id, month_year HAVING count(*) > 1) THEN RAISE WARNING 'email_usage: a creator has two rows for one month, so its unique key was not made and the count cannot be added to. See them with: select creator_id, month_year, count(*) from public.email_usage group by 1, 2 having count(*) > 1;'; ELSE CREATE UNIQUE INDEX IF NOT EXISTS email_usage_creator_month ON public.email_usage (creator_id, month_year); END IF; END $$;
ALTER TABLE public.email_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own usage" ON public.email_usage;
CREATE POLICY "Users can view their own usage" ON public.email_usage FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.email_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.email_usage FROM authenticated;
GRANT SELECT ON public.email_usage TO authenticated;
GRANT ALL ON public.email_usage TO service_role;
/* Called with the service role after each send (lib/automations/run.ts, the cron). Nobody else may move a creator's count. */
CREATE OR REPLACE FUNCTION public.increment_email_usage(p_creator_id uuid, p_count integer DEFAULT 1) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$ BEGIN INSERT INTO public.email_usage (creator_id, month_year, emails_sent) VALUES (p_creator_id, to_char(now(), 'YYYY-MM'), greatest(p_count, 0)) ON CONFLICT (creator_id, month_year) DO UPDATE SET emails_sent = public.email_usage.emails_sent + greatest(p_count, 0), updated_at = now(); END; $$;
REVOKE ALL ON FUNCTION public.increment_email_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_email_usage(uuid, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.get_email_usage(p_creator_id uuid) RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$ SELECT coalesce((SELECT emails_sent FROM public.email_usage WHERE creator_id = p_creator_id AND month_year = to_char(now(), 'YYYY-MM')), 0); $$;
REVOKE ALL ON FUNCTION public.get_email_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_usage(uuid) TO service_role;

/* 7. Automations: what starts one (trigger_type, trigger_config with its template, entry rule, products and audience), Draft, Live or Paused, and its steps. The builder saves through the creator's own session, so a creator manages their own. */
CREATE TABLE IF NOT EXISTS public.email_flows ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, name text NOT NULL DEFAULT 'Untitled automation', description text, trigger_type text NOT NULL DEFAULT 'new_subscriber', trigger_config jsonb DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'draft', steps jsonb DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_flows ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.email_flows ADD COLUMN IF NOT EXISTS trigger_config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.email_flows ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.email_flows ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_flows ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_email_flows_creator_id ON public.email_flows (creator_id);
CREATE INDEX IF NOT EXISTS idx_email_flows_active_trigger ON public.email_flows (creator_id, trigger_type, status) WHERE status = 'active';
DROP TRIGGER IF EXISTS update_email_flows_updated_at ON public.email_flows;
CREATE TRIGGER update_email_flows_updated_at BEFORE UPDATE ON public.email_flows FOR EACH ROW EXECUTE FUNCTION public.email_touch_updated_at();
ALTER TABLE public.email_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own flows" ON public.email_flows;
CREATE POLICY "Users can manage their own flows" ON public.email_flows FOR ALL TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid()))) WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.email_flows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_flows TO authenticated;
GRANT ALL ON public.email_flows TO service_role;

/* 8. The older delayed email queue, from before the engine: still sent by the hourly cron for rows already in it, and still used on a database without the engine's tables. Written by the server only: a row here is an email Storelib sends, so a creator reads theirs and cannot add one. */
CREATE TABLE IF NOT EXISTS public.scheduled_flow_emails ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, step_id text NOT NULL, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, recipient_email text NOT NULL, recipient_name text, subject text NOT NULL, body text NOT NULL, scheduled_for timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', sent_at timestamptz, error_message text, order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, product_id uuid REFERENCES public.products(id) ON DELETE SET NULL, metadata jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.scheduled_flow_emails ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_flow_id ON public.scheduled_flow_emails (flow_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_creator_id ON public.scheduled_flow_emails (creator_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_flow_emails_pending ON public.scheduled_flow_emails (status, scheduled_for) WHERE status = 'pending';
DROP TRIGGER IF EXISTS update_scheduled_flow_emails_updated_at ON public.scheduled_flow_emails;
CREATE TRIGGER update_scheduled_flow_emails_updated_at BEFORE UPDATE ON public.scheduled_flow_emails FOR EACH ROW EXECUTE FUNCTION public.email_touch_updated_at();
ALTER TABLE public.scheduled_flow_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own scheduled emails" ON public.scheduled_flow_emails;
DROP POLICY IF EXISTS "Creators read their own scheduled emails" ON public.scheduled_flow_emails;
CREATE POLICY "Creators read their own scheduled emails" ON public.scheduled_flow_emails FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON public.scheduled_flow_emails FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.scheduled_flow_emails FROM authenticated;
GRANT SELECT ON public.scheduled_flow_emails TO authenticated;
GRANT ALL ON public.scheduled_flow_emails TO service_role;

/* 9. The engine (lib/automations/engine.ts): a run per person per entry, a job per step, a send row per email, each written once by a unique key. The server writes them; a creator reads their own. */
CREATE TABLE IF NOT EXISTS public.email_flow_runs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, dedupe_key text NOT NULL, trigger_type text NOT NULL, status text NOT NULL DEFAULT 'active', current_step_id text, exit_reason text, context jsonb NOT NULL DEFAULT '{}'::jsonb, source_detail jsonb, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS current_step_id text;
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS exit_reason text;
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS source_detail jsonb;
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.email_flow_runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.email_flow_runs DROP CONSTRAINT IF EXISTS email_flow_runs_status_check;
ALTER TABLE public.email_flow_runs ADD CONSTRAINT email_flow_runs_status_check CHECK (status IN ('active', 'completed', 'exited', 'cancelled', 'failed')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_runs_dedupe ON public.email_flow_runs (flow_id, dedupe_key);
CREATE INDEX IF NOT EXISTS email_flow_runs_contact ON public.email_flow_runs (flow_id, email, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_creator_email ON public.email_flow_runs (creator_id, email);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_recent ON public.email_flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_active ON public.email_flow_runs (flow_id) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS public.email_flow_jobs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, after_step_id text, state text NOT NULL DEFAULT 'queued', run_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, last_error text, claimed_by text, claimed_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS after_step_id text;
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS claimed_by text;
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS claimed_until timestamptz;
ALTER TABLE public.email_flow_jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.email_flow_jobs DROP CONSTRAINT IF EXISTS email_flow_jobs_state_check;
ALTER TABLE public.email_flow_jobs ADD CONSTRAINT email_flow_jobs_state_check CHECK (state IN ('queued', 'running', 'done', 'failed', 'cancelled')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_jobs_once ON public.email_flow_jobs (run_id, step_id);
CREATE INDEX IF NOT EXISTS email_flow_jobs_due ON public.email_flow_jobs (run_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS email_flow_jobs_leased ON public.email_flow_jobs (claimed_until) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS email_flow_jobs_flow_state ON public.email_flow_jobs (flow_id, state);
CREATE TABLE IF NOT EXISTS public.email_flow_sends ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, email text NOT NULL, subject text, status text NOT NULL DEFAULT 'sending', provider_id text, error text, token uuid NOT NULL DEFAULT gen_random_uuid(), sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE public.email_flow_sends ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE public.email_flow_sends DROP CONSTRAINT IF EXISTS email_flow_sends_status_check;
ALTER TABLE public.email_flow_sends ADD CONSTRAINT email_flow_sends_status_check CHECK (status IN ('sending', 'sent', 'failed', 'interrupted')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_once ON public.email_flow_sends (run_id, step_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_token ON public.email_flow_sends (token);
CREATE INDEX IF NOT EXISTS email_flow_sends_flow_step ON public.email_flow_sends (flow_id, step_id);
ALTER TABLE public.email_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_flow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_flow_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_flow_runs FROM anon;
REVOKE ALL ON public.email_flow_jobs FROM anon;
REVOKE ALL ON public.email_flow_sends FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_jobs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_sends FROM authenticated;
GRANT SELECT ON public.email_flow_runs TO authenticated;
GRANT SELECT ON public.email_flow_jobs TO authenticated;
GRANT SELECT ON public.email_flow_sends TO authenticated;
DROP POLICY IF EXISTS "Creators read their own flow runs" ON public.email_flow_runs;
CREATE POLICY "Creators read their own flow runs" ON public.email_flow_runs FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Creators read their own flow jobs" ON public.email_flow_jobs;
CREATE POLICY "Creators read their own flow jobs" ON public.email_flow_jobs FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Creators read their own flow sends" ON public.email_flow_sends;
CREATE POLICY "Creators read their own flow sends" ON public.email_flow_sends FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.email_flow_runs TO service_role;
GRANT ALL ON public.email_flow_jobs TO service_role;
GRANT ALL ON public.email_flow_sends TO service_role;

/* The engine's functions. Entering a flow checks the rule's time window under a lock and writes the run and its first job in one go; claiming takes due jobs with a lease, two workers never the same one. Server only. */
CREATE OR REPLACE FUNCTION public.enroll_email_flow(p_flow_id uuid, p_creator_id uuid, p_email text, p_name text, p_dedupe_key text, p_window_days integer, p_trigger_type text, p_first_step_id text, p_context jsonb, p_source jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_run uuid; v_email text := lower(trim(p_email)); BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_flow_id::text || ':' || v_email)); IF NOT EXISTS (SELECT 1 FROM email_flows WHERE id = p_flow_id AND creator_id = p_creator_id AND status = 'active') THEN RETURN NULL; END IF; IF p_window_days < 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email) THEN RETURN NULL; END IF; IF p_window_days > 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email AND started_at > now() - make_interval(days => p_window_days)) THEN RETURN NULL; END IF; INSERT INTO email_flow_runs (flow_id, creator_id, email, name, dedupe_key, trigger_type, current_step_id, context, source_detail) VALUES (p_flow_id, p_creator_id, v_email, p_name, p_dedupe_key, p_trigger_type, p_first_step_id, coalesce(p_context, '{}'::jsonb), p_source) ON CONFLICT (flow_id, dedupe_key) DO NOTHING RETURNING id INTO v_run; IF v_run IS NULL THEN RETURN NULL; END IF; INSERT INTO email_flow_jobs (run_id, flow_id, creator_id, step_id, run_at) VALUES (v_run, p_flow_id, p_creator_id, p_first_step_id, now()) ON CONFLICT (run_id, step_id) DO NOTHING; RETURN v_run; END; $$;
REVOKE ALL ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_email_flow_jobs(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 300) RETURNS SETOF public.email_flow_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ UPDATE public.email_flow_jobs j SET state = 'running', claimed_by = p_worker, claimed_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))), attempts = j.attempts + 1, updated_at = now() WHERE j.id IN (SELECT q.id FROM public.email_flow_jobs q WHERE (q.state = 'queued' AND q.run_at <= now()) OR (q.state = 'running' AND q.claimed_until < now()) ORDER BY q.run_at LIMIT greatest(1, least(p_limit, 50)) FOR UPDATE SKIP LOCKED) RETURNING j.*; $$;
REVOKE ALL ON FUNCTION public.claim_email_flow_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_flow_jobs(text, integer, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.email_flow_health() RETURNS TABLE (queued_due bigint, running_stale bigint, failed_last_day bigint, active_without_job bigint, oldest_due timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT (SELECT count(*) FROM email_flow_jobs WHERE state = 'queued' AND run_at <= now()), (SELECT count(*) FROM email_flow_jobs WHERE state = 'running' AND claimed_until < now()), (SELECT count(*) FROM email_flow_jobs WHERE state = 'failed' AND updated_at > now() - interval '1 day'), (SELECT count(*) FROM email_flow_runs r WHERE r.status = 'active' AND r.started_at < now() - interval '1 hour' AND NOT EXISTS (SELECT 1 FROM email_flow_jobs j WHERE j.run_id = r.id AND j.state IN ('queued', 'running'))), (SELECT min(run_at) FROM email_flow_jobs WHERE state = 'queued' AND run_at <= now()); $$;
REVOKE ALL ON FUNCTION public.email_flow_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_flow_health() TO service_role;
/* The builder's numbers per email, and the Emails list's per automation, read as the creator: row level security keeps them to their own. */
CREATE OR REPLACE FUNCTION public.email_flow_step_stats(p_flow_id uuid) RETURNS TABLE (step_id text, sent bigint, opened bigint, clicked bigint, failed bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT s.step_id, count(*) FILTER (WHERE s.status = 'sent'), count(*) FILTER (WHERE s.opened_at IS NOT NULL), count(*) FILTER (WHERE s.clicked_at IS NOT NULL), count(*) FILTER (WHERE s.status IN ('failed', 'interrupted')) FROM public.email_flow_sends s WHERE s.flow_id = p_flow_id GROUP BY s.step_id; $$;
REVOKE ALL ON FUNCTION public.email_flow_step_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_flow_step_stats(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.email_flow_totals() RETURNS TABLE (flow_id uuid, sent bigint, opened bigint, clicked bigint, failed bigint, in_progress bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT f.id, (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.status = 'sent'), (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.opened_at IS NOT NULL), (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.clicked_at IS NOT NULL), (SELECT count(*) FROM public.email_flow_jobs j WHERE j.flow_id = f.id AND j.state = 'failed'), (SELECT count(*) FROM public.email_flow_runs r WHERE r.flow_id = f.id AND r.status = 'active') FROM public.email_flows f; $$;
REVOKE ALL ON FUNCTION public.email_flow_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_flow_totals() TO authenticated, service_role;

/* 10. Checkouts that reached Pay, for the checkout reminder: swept an hour later by the cron, settled once. Server only; a creator reads their own. */
CREATE TABLE IF NOT EXISTS public.checkout_starts ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, product_id uuid REFERENCES public.products(id) ON DELETE CASCADE, variant_id uuid, product_title text, email text NOT NULL, first_name text, payment_intent_id text NOT NULL, email_opt_in boolean NOT NULL DEFAULT false, source_detail jsonb, created_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz, outcome text );
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS product_title text;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS email_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS source_detail jsonb;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS handled_at timestamptz;
ALTER TABLE public.checkout_starts ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_email_lower;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_email_lower CHECK (email = lower(email)) NOT VALID;
ALTER TABLE public.checkout_starts DROP CONSTRAINT IF EXISTS checkout_starts_outcome_check;
ALTER TABLE public.checkout_starts ADD CONSTRAINT checkout_starts_outcome_check CHECK (outcome IS NULL OR outcome IN ('bought', 'unsubscribed', 'no_consent', 'entered')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS checkout_starts_intent ON public.checkout_starts (payment_intent_id);
CREATE INDEX IF NOT EXISTS checkout_starts_due ON public.checkout_starts (created_at) WHERE handled_at IS NULL;
CREATE INDEX IF NOT EXISTS checkout_starts_contact ON public.checkout_starts (creator_id, email);
ALTER TABLE public.checkout_starts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_starts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.checkout_starts FROM authenticated;
GRANT SELECT ON public.checkout_starts TO authenticated;
DROP POLICY IF EXISTS "Creators read their own started checkouts" ON public.checkout_starts;
CREATE POLICY "Creators read their own started checkouts" ON public.checkout_starts FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.checkout_starts TO service_role;

/* 11. Contact form messages from a creator's website, read under Emails. Server only; a creator reads their own. */
CREATE TABLE IF NOT EXISTS public.site_contact_messages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL, email text NOT NULL, name text, subject text, message text NOT NULL, consent boolean NOT NULL DEFAULT false, site text, page text, source_detail jsonb, emailed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS site text;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS page text;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS source_detail jsonb;
ALTER TABLE public.site_contact_messages ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.site_contact_messages DROP CONSTRAINT IF EXISTS site_contact_messages_email_lower;
ALTER TABLE public.site_contact_messages ADD CONSTRAINT site_contact_messages_email_lower CHECK (email = lower(email)) NOT VALID;
ALTER TABLE public.site_contact_messages DROP CONSTRAINT IF EXISTS site_contact_messages_sizes;
ALTER TABLE public.site_contact_messages ADD CONSTRAINT site_contact_messages_sizes CHECK (char_length(message) <= 5000 AND char_length(coalesce(subject, '')) <= 150 AND char_length(coalesce(name, '')) <= 120) NOT VALID;
CREATE INDEX IF NOT EXISTS site_contact_messages_creator_created ON public.site_contact_messages (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS site_contact_messages_creator_email ON public.site_contact_messages (creator_id, email);
ALTER TABLE public.site_contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_contact_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.site_contact_messages FROM authenticated;
DROP POLICY IF EXISTS "Creators read their own contact messages" ON public.site_contact_messages;
CREATE POLICY "Creators read their own contact messages" ON public.site_contact_messages FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT SELECT ON public.site_contact_messages TO authenticated;
GRANT ALL ON public.site_contact_messages TO service_role;

/* 12. The rate limit counter the automation test and preview routes count in (lib/api/rate-limit.ts). Server only. */
CREATE TABLE IF NOT EXISTS public.rate_limit_hits ( id bigserial PRIMARY KEY, bucket text NOT NULL, subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup ON public.rate_limit_hits (bucket, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_sweep ON public.rate_limit_hits (created_at);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;

/* 13. Pictures in an email (app/api/email/upload-image): a public bucket, pictures only, 5 MB each. Uploaded by the server, so it needs no storage policy. Skipped where there is no storage schema. */
DO $$ BEGIN IF to_regclass('storage.buckets') IS NULL THEN RAISE NOTICE 'no storage.buckets here: the email-images bucket is made by the upload route the first time it is needed'; RETURN; END IF; INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('email-images', 'email-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']) ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']; END $$;

/* 14. The API sees the new columns and functions at once. */
NOTIFY pgrst, 'reload schema';

/* 15. One row: true where each piece is in place. Every column should read true. */
SELECT to_regclass('public.subscribers') IS NOT NULL AND (SELECT count(*) = 6 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name IN ('source_detail', 'consent_text', 'status', 'is_active', 'unsubscribe_token', 'unsubscribed_at')) AS contacts, to_regclass('public.email_segments') IS NOT NULL AS segments, (SELECT count(*) = 5 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_campaigns' AND column_name IN ('last_error', 'completed_at', 'send_idempotency_key', 'track_opens', 'rendered_html')) AS campaigns, (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaign_recipients' AND column_name IN ('attempts', 'next_attempt_at', 'claimed_at')) AS recipients, (SELECT count(*) = 2 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_events' AND column_name IN ('email', 'recipient_id')) AS events, to_regprocedure('public.increment_email_usage(uuid, integer)') IS NOT NULL AS usage_count, to_regclass('public.email_flows') IS NOT NULL AND to_regclass('public.scheduled_flow_emails') IS NOT NULL AS automations, to_regclass('public.email_flow_runs') IS NOT NULL AND to_regclass('public.email_flow_jobs') IS NOT NULL AND to_regclass('public.email_flow_sends') IS NOT NULL AS engine_tables, to_regprocedure('public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb)') IS NOT NULL AND to_regprocedure('public.claim_email_flow_jobs(text, integer, integer)') IS NOT NULL AND to_regprocedure('public.email_flow_health()') IS NOT NULL AND to_regprocedure('public.email_flow_step_stats(uuid)') IS NOT NULL AND to_regprocedure('public.email_flow_totals()') IS NOT NULL AS engine_functions, to_regclass('public.checkout_starts') IS NOT NULL AS checkout_reminder, to_regclass('public.site_contact_messages') IS NOT NULL AS contact_messages, to_regclass('public.subscribers_creator_email_lower') IS NOT NULL AS one_contact_per_address, NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscribers' AND cmd = 'INSERT' AND roles @> ARRAY['public']::name[] AND with_check = 'true') AS no_open_signup_policy;

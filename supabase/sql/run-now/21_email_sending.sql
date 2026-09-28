/* Email campaigns: the send pipeline statuses and audience types, send bookkeeping (last error, completion, idempotency key, open tracking switch, the HTML as sent), per address send rows, and private reads. Needs nothing else. */
/* 1. Statuses and audiences. NOT VALID: new rows are checked, old ones are left alone. */
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')) NOT VALID;
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_type_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_audience_type_check CHECK (audience_type IN ('all', 'subscribers', 'customers', 'onepage', 'store_builder', 'segment', 'last_24h', 'last_7days', 'last_30days', 'last_90days')) NOT VALID;
/* 2. What a campaign remembers about its send. */
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS send_idempotency_key TEXT;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS track_opens BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS rendered_html TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_send_once ON public.email_campaigns (creator_id, send_idempotency_key) WHERE send_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_campaigns_due ON public.email_campaigns (status, scheduled_at);
CREATE INDEX IF NOT EXISTS email_campaigns_active ON public.email_campaigns (status, updated_at);
/* The sending lease is the campaign's updated_at, so every update must move it. */
CREATE OR REPLACE FUNCTION public.update_email_campaigns_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_email_campaigns_updated_at();
/* 3. Each recipient row: claimed before the send, retried with backoff. */
ALTER TABLE public.campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT campaign_recipients_status_check CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped', 'unknown')) NOT VALID;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
/* 4. One row per address per campaign, and what the queue looks things up by. */
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recipients_unique ON public.campaign_recipients (campaign_id, email);
CREATE INDEX IF NOT EXISTS campaign_recipients_queue ON public.campaign_recipients (campaign_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS campaign_recipients_month ON public.campaign_recipients (creator_id, created_at);
CREATE INDEX IF NOT EXISTS campaign_recipients_message ON public.campaign_recipients (provider_message_id);
/* 5. Nobody but the server writes these, and a creator reads only their own. */
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_recipients FROM anon;
DROP POLICY IF EXISTS "Creators read their own recipients" ON public.campaign_recipients;
CREATE POLICY "Creators read their own recipients" ON public.campaign_recipients FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_events FROM anon;
DROP POLICY IF EXISTS "Anyone can insert events via tracking" ON public.email_events;
DROP POLICY IF EXISTS "Creators read their own email events" ON public.email_events;
ALTER TABLE public.email_events ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators(id) ON DELETE CASCADE;
CREATE POLICY "Creators read their own email events" ON public.email_events FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

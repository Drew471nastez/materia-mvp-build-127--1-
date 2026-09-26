-- STORELIB DATABASE, FILE 3 of 4
-- Saved cards, bounces and exec_sql closed, email sending, domains for a website or creator page, browser notifications and time zone, Ask Storelib conversations and pictures, Analytics speed, business accounts, creator badges, Ask Storelib reports, notification rules, website accounts and contact forms, discount code holds, orders kept with their creator, customer accounts on websites.
-- HOW: select all of this file, copy, paste into a NEW query tab in the Supabase
-- SQL editor, press Run. Run the four files in order, one at a time.
-- Safe to run again: every statement checks before it changes anything, so a
-- second run changes nothing. If Run shows an error, stop and send it; the
-- editor runs the paste as one transaction, so nothing in this file changed.
-- Built from supabase/sql/run-now/ (one statement per line, text unchanged).

set local statement_timeout = 0;

-- part 20_saved_cards_bounces_and_exec_sql.sql
/* Saved cards land, the bounce list reads, exec_sql is closed to the public key, and search ranks without a general SQL runner. */
do $$ declare dup record; dups integer := 0; begin if to_regclass('public.payment_methods') is null then raise notice 'skipping payment_methods: the table does not exist here'; return; end if; for dup in select stripe_payment_method_id as pm, count(*) as n from public.payment_methods where stripe_payment_method_id is not null group by 1 having count(*) > 1 order by 2 desc, 1 loop dups := dups + 1; raise warning 'payment_methods holds % rows for stripe_payment_method_id %: a Stripe payment method id belongs to one row, so keep the newest and remove the rest by hand, then run this part again', dup.n, dup.pm; end loop; if dups > 0 then raise warning 'payment_methods: % duplicated payment method ids, so the unique key was not created and nothing was deleted', dups; else create unique index if not exists payment_methods_stripe_payment_method_id_key on public.payment_methods (stripe_payment_method_id); end if; alter table public.payment_methods alter column type set default 'card'; end; $$;
do $$ begin if to_regclass('public.email_events') is null then raise notice 'skipping email_events: the table does not exist here'; return; end if; alter table public.email_events alter column creator_id drop not null; if exists (select 1 from pg_constraint where conrelid = 'public.email_events'::regclass and conname = 'email_events_event_type_check') then alter table public.email_events drop constraint email_events_event_type_check; end if; alter table public.email_events add constraint email_events_event_type_check check (event_type in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed', 'complained')); end; $$;
do $$ declare f record; r text; n integer := 0; begin for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'exec_sql' loop n := n + 1; execute format('revoke all on function %s from public', f.sig); foreach r in array array['anon', 'authenticated'] loop if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function %s from %I', f.sig, r); end if; end loop; raise notice 'revoked % from public, anon and authenticated: it runs arbitrary SQL as its definer, so only the service role may call it', f.sig; end loop; if n = 0 then raise notice 'no public.exec_sql here, nothing to revoke'; end if; end; $$;
create or replace function public.search_products_ranked(p_query text, p_category text default null, p_sort text default 'relevance', p_limit integer default 30, p_offset integer default 0) returns setof jsonb language sql stable security invoker set search_path = public as $fn$ select to_jsonb(p) || jsonb_build_object( 'text_rank', ts_rank_cd(p.search_vector, to_tsquery('english', p_query), 32), 'popularity_boost', least(log(greatest(p.sales_count, 1)::numeric + 1) * 0.3, 2.0)::double precision, 'review_boost', (case when coalesce(p.reviews_count, 0) > 0 then (coalesce(p.reviews_average, 0) / 5.0) * least(log((p.reviews_count + 1)::numeric) * 0.2, 1.0) else 0 end)::double precision, 'freshness_boost', (case when p.created_at > now() - interval '7 days' then 0.5 when p.created_at > now() - interval '30 days' then 0.3 when p.created_at > now() - interval '90 days' then 0.1 else 0 end)::double precision, 'completeness_boost', ((case when p.thumbnail_url is not null then 0.2 else 0 end) + (case when length(coalesce(p.description, '')) > 100 then 0.15 else 0 end) + (case when coalesce(array_length(p.gallery_urls, 1), 0) > 0 then 0.1 else 0 end))::double precision, 'creator_slug', c.slug, 'creator_name', c.display_name, 'creator_avatar', c.avatar_url ) from public.products p left join public.creators c on c.id = p.creator_id where p.status = 'published' and p.search_vector @@ to_tsquery('english', p_query) and (p_category is null or p_category = '' or lower(p_category) = 'all' or lower(coalesce(p.category, '')) = lower(p_category)) order by case when coalesce(p_sort, 'relevance') = 'relevance' then (ts_rank_cd(p.search_vector, to_tsquery('english', p_query), 32) * 2.0)::double precision + least(log(greatest(p.sales_count, 1)::numeric + 1) * 0.3, 2.0)::double precision + (case when coalesce(p.reviews_count, 0) > 0 then (coalesce(p.reviews_average, 0) / 5.0) * least(log((p.reviews_count + 1)::numeric) * 0.2, 1.0) else 0 end)::double precision + (case when p.created_at > now() - interval '7 days' then 0.5 when p.created_at > now() - interval '30 days' then 0.3 when p.created_at > now() - interval '90 days' then 0.1 else 0 end)::double precision + (case when p.thumbnail_url is not null then 0.2 else 0 end)::double precision + (case when length(coalesce(p.description, '')) > 100 then 0.15 else 0 end)::double precision end desc nulls last, case when p_sort = 'newest' then p.created_at end desc nulls last, case when p_sort = 'popular' then p.sales_count end desc nulls last, case when p_sort = 'price-high' then p.price_cents end desc nulls last, case when p_sort = 'price-low' then p.price_cents end asc nulls last, p.id limit greatest(coalesce(p_limit, 30), 0) offset greatest(coalesce(p_offset, 0), 0) $fn$;
do $$ declare r text; begin execute 'revoke all on function public.search_products_ranked(text, text, text, integer, integer) from public'; foreach r in array array['anon', 'authenticated'] loop if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function public.search_products_ranked(text, text, text, integer, integer) from %I', r); end if; end loop; if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function public.search_products_ranked(text, text, text, integer, integer) to service_role'; end if; end; $$;

-- part 21_email_sending.sql
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
CREATE POLICY "Creators read their own email events" ON public.email_events FOR SELECT TO authenticated USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

-- part 22_custom_domain_purposes.sql
/* Connected domains: website or creator page, one primary of each, the DNS records Vercel recommended, and written by the server only. Source: supabase/migrations/20261001_custom_domain_purposes.sql. */
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'website';
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS dns_records JSONB;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_purpose_check;
ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_purpose_check CHECK (purpose IN ('website', 'creator_page')) NOT VALID;
UPDATE public.custom_domains d SET is_primary = true WHERE d.id IN (SELECT DISTINCT ON (creator_id, purpose) id FROM public.custom_domains ORDER BY creator_id, purpose, created_at ASC) AND NOT EXISTS (SELECT 1 FROM public.custom_domains p WHERE p.creator_id = d.creator_id AND p.purpose = d.purpose AND p.is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_primary ON public.custom_domains (creator_id, purpose) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_custom_domains_creator_purpose ON public.custom_domains (creator_id, purpose);
DROP POLICY IF EXISTS "Creators can add own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can update own domains" ON public.custom_domains;
DROP POLICY IF EXISTS "Creators can delete own domains" ON public.custom_domains;
REVOKE INSERT, UPDATE, DELETE ON public.custom_domains FROM anon, authenticated;
DO $$ BEGIN IF to_regclass('public.domain_redirects') IS NOT NULL THEN REVOKE INSERT, UPDATE, DELETE ON public.domain_redirects FROM anon, authenticated; END IF; END $$;

-- part 23_browser_push_and_time_zone.sql
/* Browser notifications save (push_tokens takes platform 'web'), and the account's time zone (profiles.timezone). */
do $$ declare c record; begin if to_regclass('public.push_tokens') is null then raise notice 'skipping push_tokens: the table does not exist here (scripts/060_create_push_tokens.sql)'; return; end if; for c in select conname from pg_constraint where conrelid = 'public.push_tokens'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%platform%' loop execute format('alter table public.push_tokens drop constraint %I', c.conname); end loop; alter table public.push_tokens add constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web')); create unique index if not exists push_tokens_token_idx on public.push_tokens (token); end; $$;
alter table public.profiles add column if not exists timezone text;

-- part 24_theme_chat_conversations.sql
/* Ask Storelib conversations: new chat and history. Each message belongs to a conversation on its own website, read only by the creator who owns it. Creates the chat table too if it is missing. Needs nothing else. */
CREATE TABLE IF NOT EXISTS public.theme_chat_messages ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, page_key text NOT NULL DEFAULT 'home', role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL DEFAULT '', ops jsonb NOT NULL DEFAULT '[]', error text, created_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS theme_chat_messages_install_idx ON public.theme_chat_messages (install_id, created_at);
ALTER TABLE public.theme_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.theme_chat_conversations ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, title text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS theme_chat_conversations_install_idx ON public.theme_chat_conversations (install_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_conversations_id_install ON public.theme_chat_conversations (id, install_id);
ALTER TABLE public.theme_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_chat_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.theme_chat_messages DROP CONSTRAINT IF EXISTS theme_chat_messages_conversation_fk;
ALTER TABLE public.theme_chat_messages ADD CONSTRAINT theme_chat_messages_conversation_fk FOREIGN KEY (conversation_id, install_id) REFERENCES public.theme_chat_conversations (id, install_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS theme_chat_messages_conversation_idx ON public.theme_chat_messages (conversation_id, created_at);
DROP POLICY IF EXISTS tcc_own_read ON public.theme_chat_conversations;
CREATE POLICY tcc_own_read ON public.theme_chat_conversations FOR SELECT USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid()));
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'theme_chat_messages' AND policyname = 'tcm_own') THEN CREATE POLICY tcm_own ON public.theme_chat_messages USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid())) WITH CHECK (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid())); END IF; END $$;

-- part 25_analytics_speed.sql
/* Analytics that load quickly: indexes in the order the reports read, and the counting done in the database (analytics_visit_tally, analytics_all_time), the server's alone. Source: supabase/migrations/20261002_analytics_report_speed.sql. */
CREATE INDEX IF NOT EXISTS idx_analytics_events_creator_type_time_id ON public.analytics_events (creator_id, event_type, created_at, id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product_type_time_id ON public.analytics_events (product_id, event_type, created_at, id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_product_time_id ON public.orders (product_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_views_page_time_id ON public.onepage_views (onepage_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_page_time_id ON public.onepage_clicks (onepage_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_page_time_id ON public.onepage_leads (onepage_id, created_at, id);
CREATE OR REPLACE FUNCTION public.analytics_visit_tally( p_creator_id uuid, p_product_id uuid, p_time_zone text, p_cur_start bigint, p_cur_end bigint, p_prev_start bigint, p_prev_end bigint, p_cur_starts bigint[], p_prev_starts bigint[], p_detail boolean DEFAULT true ) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $fn$WITH bounds AS ( SELECT timestamptz 'epoch' + p_cur_start * interval '1 millisecond' AS cs, timestamptz 'epoch' + p_cur_end * interval '1 millisecond' AS ce, timestamptz 'epoch' + p_prev_start * interval '1 millisecond' AS ps, timestamptz 'epoch' + p_prev_end * interval '1 millisecond' AS pe, coalesce(cardinality(p_cur_starts), 0) AS n ), win AS ( SELECT 'cur'::text AS w, b.cs AS ws, b.ce AS we, ARRAY(SELECT timestamptz 'epoch' + x * interval '1 millisecond' FROM unnest(coalesce(p_cur_starts, '{}'::bigint[])) WITH ORDINALITY u(x, i) ORDER BY i) AS starts FROM bounds b UNION ALL SELECT 'prev'::text, b.ps, b.pe, ARRAY(SELECT timestamptz 'epoch' + x * interval '1 millisecond' FROM unnest(coalesce(p_prev_starts, '{}'::bigint[])) WITH ORDINALITY u(x, i) ORDER BY i) FROM bounds b ), raw AS ( SELECT e.id, e.created_at, e.session_id::text AS session_id, e.visitor_id::text AS visitor_id, e.source_category, e.referrer_domain, e.utm_campaign, e.country_code, e.country_name, e.city, e.device_type, e.browser, e.os, e.page_url FROM public.analytics_events e, bounds b WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id) AND e.created_at >= b.cs AND e.created_at < b.ce UNION ALL SELECT e.id, e.created_at, e.session_id::text, e.visitor_id::text, e.source_category, e.referrer_domain, e.utm_campaign, e.country_code, e.country_name, e.city, e.device_type, e.browser, e.os, e.page_url FROM public.analytics_events e, bounds b WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id) AND e.created_at >= b.ps AND e.created_at < b.pe AND NOT (e.created_at >= b.cs AND e.created_at < b.ce) ), wrows AS ( SELECT w.w, r.id, r.created_at, CASE WHEN cardinality(w.starts) > 0 THEN width_bucket(r.created_at, w.starts) - 1 END AS bucket, (CASE WHEN coalesce(r.session_id, '') <> '' THEN 's:' || r.session_id WHEN coalesce(r.visitor_id, '') <> '' THEN 'v:' || r.visitor_id || ':' || ( floor(extract(epoch FROM r.created_at))::bigint - floor(extract(epoch FROM (r.created_at AT TIME ZONE p_time_zone)::time))::bigint )::text ELSE 'e:' || r.id::text END) COLLATE "C" AS skey FROM raw r JOIN win w ON r.created_at >= w.ws AND r.created_at < w.we ), firsts AS ( SELECT DISTINCT ON (w, skey) w, skey, created_at, id, bucket FROM wrows ORDER BY w, skey, created_at, id ), ranked AS ( SELECT f.w, row_number() OVER (PARTITION BY f.w ORDER BY f.created_at, f.id) AS rank, r.source_category, r.referrer_domain, r.utm_campaign, r.country_code, r.country_name, r.city, r.device_type, r.browser, r.os, split_part(split_part(r.page_url, '#', 1), '?', 1) AS page_url FROM firsts f JOIN raw r ON r.id = f.id WHERE p_detail ), view_b AS (SELECT w, bucket, count(*) AS c FROM wrows GROUP BY w, bucket), session_b AS (SELECT w, bucket, count(*) AS c FROM firsts GROUP BY w, bucket), buckets AS ( SELECT w.w, coalesce((SELECT sum(v.c) FROM view_b v WHERE v.w = w.w), 0) AS views, coalesce((SELECT sum(s.c) FROM session_b s WHERE s.w = w.w), 0) AS sessions, coalesce((SELECT jsonb_agg(coalesce(v.c, 0) ORDER BY g.i) FROM bounds b, generate_series(0, b.n - 1) g(i) LEFT JOIN view_b v ON v.w = w.w AND v.bucket = g.i), '[]'::jsonb) AS view_buckets, coalesce((SELECT jsonb_agg(coalesce(s.c, 0) ORDER BY g.i) FROM bounds b, generate_series(0, b.n - 1) g(i) LEFT JOIN session_b s ON s.w = w.w AND s.bucket = g.i), '[]'::jsonb) AS session_buckets FROM win w ), steps AS ( SELECT w.w, s.event_type, count(DISTINCT s.skey) AS c FROM ( SELECT e.event_type, e.created_at, (CASE WHEN coalesce(e.session_id::text, '') <> '' THEN 's:' || e.session_id::text WHEN coalesce(e.visitor_id::text, '') <> '' THEN 'v:' || e.visitor_id::text || ':' || ( floor(extract(epoch FROM e.created_at))::bigint - floor(extract(epoch FROM (e.created_at AT TIME ZONE p_time_zone)::time))::bigint )::text ELSE 'e:' || e.created_at::text END) COLLATE "C" AS skey FROM public.analytics_events e, bounds b WHERE p_detail AND e.creator_id = p_creator_id AND e.event_type IN ('buy_click', 'checkout_start') AND (p_product_id IS NULL OR e.product_id = p_product_id) AND ((e.created_at >= b.cs AND e.created_at < b.ce) OR (e.created_at >= b.ps AND e.created_at < b.pe)) ) s JOIN win w ON s.created_at >= w.ws AND s.created_at < w.we GROUP BY w.w, s.event_type ), grouped AS ( SELECT w, CASE WHEN GROUPING(source_category) = 0 THEN 'source' WHEN GROUPING(referrer_domain) = 0 THEN 'referrer' WHEN GROUPING(utm_campaign) = 0 THEN 'campaign' WHEN GROUPING(city) = 0 THEN 'city' WHEN GROUPING(country_code) = 0 THEN 'country' WHEN GROUPING(device_type) = 0 THEN 'device' WHEN GROUPING(browser) = 0 THEN 'browser' WHEN GROUPING(os) = 0 THEN 'os' ELSE 'page' END AS kind, CASE WHEN GROUPING(source_category) = 0 THEN jsonb_build_array(source_category) WHEN GROUPING(referrer_domain) = 0 THEN jsonb_build_array(referrer_domain) WHEN GROUPING(utm_campaign) = 0 THEN jsonb_build_array(utm_campaign) WHEN GROUPING(city) = 0 THEN jsonb_build_array(city, country_code, country_name) WHEN GROUPING(country_code) = 0 THEN jsonb_build_array(country_code, country_name) WHEN GROUPING(device_type) = 0 THEN jsonb_build_array(device_type) WHEN GROUPING(browser) = 0 THEN jsonb_build_array(browser) WHEN GROUPING(os) = 0 THEN jsonb_build_array(os) ELSE jsonb_build_array(page_url) END AS cols, count(*) AS n, min(rank) AS r FROM ranked GROUP BY w, GROUPING SETS ((source_category), (referrer_domain), (utm_campaign), (country_code, country_name), (city, country_code, country_name), (device_type), (browser), (os), (page_url)) ), groups AS ( SELECT w, jsonb_object_agg(kind, rows) AS groups FROM (SELECT w, kind, jsonb_agg(cols || jsonb_build_array(n, r) ORDER BY r) AS rows FROM grouped GROUP BY w, kind) k GROUP BY w ), tallies AS ( SELECT w.w, jsonb_build_object( 'views', bk.views, 'view_buckets', bk.view_buckets, 'sessions', bk.sessions, 'session_buckets', bk.session_buckets, 'steps', CASE WHEN p_detail THEN jsonb_build_object( 'buy', coalesce((SELECT s.c FROM steps s WHERE s.w = w.w AND s.event_type = 'buy_click'), 0), 'checkout', coalesce((SELECT s.c FROM steps s WHERE s.w = w.w AND s.event_type = 'checkout_start'), 0) ) END, 'groups', CASE WHEN p_detail THEN coalesce((SELECT g.groups FROM groups g WHERE g.w = w.w), '{}'::jsonb) END ) AS t FROM win w JOIN buckets bk ON bk.w = w.w ) SELECT jsonb_object_agg(w, t) FROM tallies$fn$;
CREATE OR REPLACE FUNCTION public.analytics_all_time(p_creator_id uuid, p_product_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $fn$WITH lines AS ( SELECT coalesce('s:' || nullif(o.stripe_session_id, ''), 'o:' || o.id::text) AS k, o.status, greatest(0, coalesce(o.amount_cents, 0))::bigint AS gross, CASE WHEN o.status = 'refunded' THEN CASE WHEN o.refund_amount_cents > 0 THEN least(o.refund_amount_cents, greatest(0, coalesce(o.amount_cents, 0))) ELSE greatest(0, coalesce(o.amount_cents, 0)) END ELSE 0 END::bigint AS refunded FROM public.orders o WHERE o.product_id IN (SELECT p.id FROM public.products p WHERE p.creator_id = p_creator_id) AND (p_product_id IS NULL OR o.product_id = p_product_id) ), payments AS ( SELECT k, bool_and(coalesce(status = 'failed', false)) AS all_failed, bool_or(coalesce(status = 'pending', false)) AS any_pending, bool_or(coalesce(status = 'disputed', false)) AS any_disputed, greatest(0, sum(gross) - sum(refunded)) AS net FROM lines GROUP BY k ) SELECT jsonb_build_object( 'views', ( SELECT count(*) FROM public.analytics_events e WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id) ), 'orders', (SELECT count(*) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed), 'sales_cents', (SELECT coalesce(sum(net), 0) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed) )$fn$;
REVOKE ALL ON FUNCTION public.analytics_visit_tally(uuid, uuid, text, bigint, bigint, bigint, bigint, bigint[], bigint[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_all_time(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_visit_tally(uuid, uuid, text, bigint, bigint, bigint, bigint, bigint[], bigint[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_all_time(uuid, uuid) TO service_role;

-- part 26_business_accounts.sql
/* Business accounts: one login, up to two businesses. The link between a login and its second business (one per login, no chains, read by the two accounts it links, written by the server only), and a server only log of every switch. Needs nothing else. Reasons: supabase/migrations/20261001_business_accounts.sql. */
create table if not exists public.business_links (owner_id uuid not null references auth.users(id) on delete cascade, member_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), constraint business_links_pkey primary key (member_id), constraint business_links_one_per_owner unique (owner_id), constraint business_links_not_self check (owner_id <> member_id));
alter table public.business_links enable row level security;
drop policy if exists business_links_read on public.business_links;
create policy business_links_read on public.business_links for select using ((select auth.uid()) = owner_id or (select auth.uid()) = member_id);
revoke insert, update, delete on public.business_links from anon, authenticated;
create or replace function public.business_links_no_chain() returns trigger language plpgsql security definer set search_path = public as $$ begin if exists (select 1 from public.business_links where member_id = new.owner_id) then raise exception 'A business account cannot own another business'; end if; if exists (select 1 from public.business_links where owner_id = new.member_id) then raise exception 'An account that owns a business cannot be added as one'; end if; return new; end; $$;
drop trigger if exists business_links_no_chain on public.business_links;
create trigger business_links_no_chain before insert or update on public.business_links for each row execute function public.business_links_no_chain();
create table if not exists public.business_switches (id bigint generated always as identity primary key, from_user uuid not null, to_user uuid not null, created_at timestamptz not null default now(), ip text, user_agent text);
alter table public.business_switches enable row level security;
revoke all on public.business_switches from anon, authenticated;
create index if not exists business_switches_from_created on public.business_switches (from_user, created_at desc);

-- part 27_creator_badges.sql
/* Badges Storelib grants a creator (the Veteran mark beside a name on the creator page and product pages). Nobody can give themselves one through the API: a trigger keeps the old value for signed-in and anonymous requests. Until this runs, the app grants the same badge by username, so running it changes nothing on the page. */
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.profiles_keep_badges() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user IN ('authenticated', 'anon') THEN IF tg_op = 'INSERT' THEN new.badges := '{}'; ELSIF new.badges IS DISTINCT FROM old.badges THEN new.badges := old.badges; END IF; END IF; RETURN new; END $$;
DROP TRIGGER IF EXISTS profiles_keep_badges ON public.profiles;
CREATE TRIGGER profiles_keep_badges BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_keep_badges();
/* Veteran: Luca Dragoste (storelib.com/lucadragoste). A second run adds nothing. */
UPDATE public.profiles SET badges = array_append(badges, 'veteran') WHERE lower(username) = lower('lucadragoste') AND NOT ('veteran' = ANY(badges));
/* Who has a badge now. */
SELECT username, badges FROM public.profiles WHERE cardinality(badges) > 0;

-- part 28_theme_chat_reports.sql
/* Ask Storelib reports: one row per answer a creator flags, with the question and reply as they were. Written by the server only; no browser can read or write it. Needs nothing else. Source: supabase/migrations/20261003_theme_chat_reports.sql. */
CREATE TABLE IF NOT EXISTS public.theme_chat_reports ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, conversation_id uuid, message_id uuid NOT NULL, reply_message_id uuid, reason text, prompt text NOT NULL DEFAULT '', reply text NOT NULL DEFAULT '', engine text, created_at timestamptz NOT NULL DEFAULT now() );
CREATE UNIQUE INDEX IF NOT EXISTS theme_chat_reports_message ON public.theme_chat_reports (message_id);
CREATE INDEX IF NOT EXISTS theme_chat_reports_created_idx ON public.theme_chat_reports (created_at DESC);
ALTER TABLE public.theme_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_chat_reports DROP CONSTRAINT IF EXISTS theme_chat_reports_reason_length;
ALTER TABLE public.theme_chat_reports ADD CONSTRAINT theme_chat_reports_reason_length CHECK (reason IS NULL OR char_length(reason) <= 500) NOT VALID;

-- part 29_notification_rules.sql
/* Notifications that decide for themselves (lib/notifications): each thing said once per creator, resolved when fixed, pushed only when critical or a milestone, run hourly by /api/cron/notifications. Source: supabase/migrations/20261003_notification_rules.sql. Before this runs the engine does nothing and the panel reads as it always has. */
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

-- part 30_site_accounts_contact.sql
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

-- part 31_coupon_holds.sql
/* Discount code limits two buyers at once cannot pass: a payment that starts with a limited code holds a place under the limit, the order turns it into the use, an abandoned payment gives it back or it expires after 35 minutes (lib/checkout/coupon-holds.ts). Server only. Source: supabase/migrations/20261004_coupon_holds.sql. Until it runs the checkout counts uses as before. */
CREATE TABLE IF NOT EXISTS public.coupon_holds ( coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE, holder text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (coupon_id, holder) );
ALTER TABLE public.coupon_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coupon_holds FROM anon, authenticated;
/* Takes or refreshes a holder's place. The code's row is locked first, so two calls for one code run one after the other, and the second counts the first one's place. Expired places are cleared on the way. True when there is room (always, for a code with no limit), false when there is none. */
CREATE OR REPLACE FUNCTION public.hold_coupon_use(p_coupon_id uuid, p_holder text, p_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ DECLARE lim integer; used integer; others integer; BEGIN SELECT c.usage_limit, coalesce(c.usage_count, 0) INTO lim, used FROM public.coupons c WHERE c.id = p_coupon_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF; DELETE FROM public.coupon_holds h WHERE h.coupon_id = p_coupon_id AND h.expires_at < now(); IF lim IS NULL THEN RETURN true; END IF; SELECT count(*) INTO others FROM public.coupon_holds h WHERE h.coupon_id = p_coupon_id AND h.holder <> p_holder; IF used + others >= lim THEN RETURN false; END IF; INSERT INTO public.coupon_holds (coupon_id, holder, expires_at) VALUES (p_coupon_id, p_holder, now() + make_interval(secs => greatest(60, least(coalesce(p_seconds, 2100), 86400)))) ON CONFLICT (coupon_id, holder) DO UPDATE SET expires_at = excluded.expires_at; RETURN true; END $$;
/* One use counted and the holder's place dropped, in one statement each, the code's row locked first as above. Counted whether or not the place was still there: the order exists. */
CREATE OR REPLACE FUNCTION public.use_coupon_hold(p_coupon_id uuid, p_holder text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN UPDATE public.coupons SET usage_count = coalesce(usage_count, 0) + 1 WHERE id = p_coupon_id; DELETE FROM public.coupon_holds WHERE coupon_id = p_coupon_id AND holder = p_holder; END $$;
/* A place given back: the payment it was for will not happen. */
CREATE OR REPLACE FUNCTION public.release_coupon_hold(p_coupon_id uuid, p_holder text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ DELETE FROM public.coupon_holds WHERE coupon_id = p_coupon_id AND holder = p_holder; $$;
/* Only the server holds, uses and gives back places. */
REVOKE ALL ON FUNCTION public.hold_coupon_use(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_coupon_use(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_coupon_use(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.use_coupon_hold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.use_coupon_hold(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_coupon_hold(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_coupon_hold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_coupon_hold(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_coupon_hold(uuid, text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupon_holds TO service_role;

-- part 32_orders_keep_sales.sql
/* Sales kept when a product is deleted: orders carry their creator (filled from the product by a trigger, and for every order already there), deleting a product leaves its orders with no product instead of deleting them, a disputed payment can be written, and the all time line counts by the creator. Changes existing rows: fills orders.creator_id. Deletes nothing. Source: supabase/migrations/20261004_orders_keep_creator.sql. */
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS creator_id uuid;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_creator_id_fkey') THEN ALTER TABLE public.orders ADD CONSTRAINT orders_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.creators(id) ON DELETE CASCADE NOT VALID; END IF; END $$;
UPDATE public.orders o SET creator_id = p.creator_id FROM public.products p WHERE p.id = o.product_id AND o.creator_id IS DISTINCT FROM p.creator_id;
CREATE OR REPLACE FUNCTION public.orders_fill_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN IF NEW.product_id IS NOT NULL THEN NEW.creator_id := (SELECT p.creator_id FROM public.products p WHERE p.id = NEW.product_id); END IF; RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS orders_fill_creator ON public.orders;
CREATE TRIGGER orders_fill_creator BEFORE INSERT OR UPDATE OF product_id, creator_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_fill_creator();
CREATE INDEX IF NOT EXISTS idx_orders_creator_time_id ON public.orders (creator_id, created_at, id);
ALTER TABLE public.orders ALTER COLUMN product_id DROP NOT NULL;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT con.conname FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'f' AND con.confrelid = 'public.products'::regclass AND con.confdeltype <> 'n' AND con.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'product_id')] LOOP EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname); END LOOP; IF NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'f' AND con.confrelid = 'public.products'::regclass AND con.confdeltype = 'n') THEN ALTER TABLE public.orders ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL NOT VALID; END IF; END $$;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT con.conname, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con WHERE con.conrelid = 'public.orders'::regclass AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ~ '^CHECK \(\(status = ANY \(ARRAY\[' AND pg_get_constraintdef(con.oid) !~ '''disputed''' LOOP EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname); EXECUTE format('ALTER TABLE public.orders ADD CONSTRAINT %I CHECK (status = ANY (%L::text[])) NOT VALID', c.conname, ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(c.def, '''([^'']+)''', 'g') AS m) || ARRAY['disputed']); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.analytics_all_time(p_creator_id uuid, p_product_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $fn$WITH lines AS ( SELECT coalesce('s:' || nullif(o.stripe_session_id, ''), 'o:' || o.id::text) AS k, o.status, greatest(0, coalesce(o.amount_cents, 0))::bigint AS gross, CASE WHEN o.status = 'refunded' THEN CASE WHEN o.refund_amount_cents > 0 THEN least(o.refund_amount_cents, greatest(0, coalesce(o.amount_cents, 0))) ELSE greatest(0, coalesce(o.amount_cents, 0)) END ELSE 0 END::bigint AS refunded FROM public.orders o WHERE o.creator_id = p_creator_id AND (p_product_id IS NULL OR o.product_id = p_product_id) ), payments AS ( SELECT k, bool_and(coalesce(status = 'failed', false)) AS all_failed, bool_or(coalesce(status = 'pending', false)) AS any_pending, bool_or(coalesce(status = 'disputed', false)) AS any_disputed, greatest(0, sum(gross) - sum(refunded)) AS net FROM lines GROUP BY k ) SELECT jsonb_build_object( 'views', ( SELECT count(*) FROM public.analytics_events e WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id) ), 'orders', (SELECT count(*) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed), 'sales_cents', (SELECT coalesce(sum(net), 0) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed) )$fn$;
REVOKE ALL ON FUNCTION public.analytics_all_time(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_all_time(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.orders_fill_creator() FROM PUBLIC, anon, authenticated;

-- part 33_site_customers.sql
/* Customer accounts on creators' websites, as a Shopify store has them: a visitor types their email on the website, gets a six digit code, types it back and is signed in, and a new email makes the account there and then. Three tables: the customers (one per website and email), the sign in codes (kept only as a keyed hash, ten minutes, five tries, used once) and each customer's saved products. An account belongs to one creator's website and is not a Storelib login: nothing here touches auth.users, profiles or creators. Server only: row level security on, closed to the public key. Until it runs, Sign in on a website says it is not available yet. Needs nothing else. Source: supabase/migrations/20261005_site_customers.sql. */
CREATE TABLE IF NOT EXISTS public.site_customers ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, created_at timestamptz NOT NULL DEFAULT now(), last_sign_in_at timestamptz, CONSTRAINT site_customers_email_lower CHECK (email = lower(email)), CONSTRAINT site_customers_sizes CHECK (char_length(email) BETWEEN 3 AND 254 AND char_length(coalesce(name, '')) <= 120) );
CREATE UNIQUE INDEX IF NOT EXISTS site_customers_creator_email ON public.site_customers (creator_id, email);
ALTER TABLE public.site_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customers FROM anon, authenticated;
GRANT ALL ON public.site_customers TO service_role;
CREATE TABLE IF NOT EXISTS public.site_customer_codes ( id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, host text NOT NULL, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT site_customer_codes_email_lower CHECK (email = lower(email)), CONSTRAINT site_customer_codes_attempts CHECK (attempts BETWEEN 0 AND 5) );
CREATE INDEX IF NOT EXISTS site_customer_codes_creator_email ON public.site_customer_codes (creator_id, email, created_at DESC);
CREATE INDEX IF NOT EXISTS site_customer_codes_created ON public.site_customer_codes (created_at);
ALTER TABLE public.site_customer_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customer_codes FROM anon, authenticated;
GRANT ALL ON public.site_customer_codes TO service_role;
CREATE TABLE IF NOT EXISTS public.site_customer_wishlist ( customer_id uuid NOT NULL REFERENCES public.site_customers(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (customer_id, product_id) );
CREATE INDEX IF NOT EXISTS site_customer_wishlist_product ON public.site_customer_wishlist (product_id);
ALTER TABLE public.site_customer_wishlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customer_wishlist FROM anon, authenticated;
GRANT ALL ON public.site_customer_wishlist TO service_role;

-- part 34_theme_chat_attachments.sql
/* Ask Storelib pictures: the private bucket a conversation's pictures are kept in for thirty days, and one row per picture naming its message, readable only by the creator who owns the website and written by the server only. Until it runs, a sent picture shows while the chat is open and reads back as "Picture no longer available". Run after 24. Source: supabase/migrations/20261005_theme_chat_attachments.sql. */
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('theme-chat-attachments', 'theme-chat-attachments', false, 3145728, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']) ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 3145728, allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
CREATE TABLE IF NOT EXISTS public.theme_chat_attachments ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), install_id uuid NOT NULL REFERENCES public.store_theme_installs(id) ON DELETE CASCADE, message_id uuid REFERENCES public.theme_chat_messages(id) ON DELETE CASCADE, storage_path text NOT NULL, media_type text NOT NULL, byte_size integer NOT NULL DEFAULT 0, name text, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days') );
CREATE INDEX IF NOT EXISTS theme_chat_attachments_message_idx ON public.theme_chat_attachments (message_id);
CREATE INDEX IF NOT EXISTS theme_chat_attachments_expiry_idx ON public.theme_chat_attachments (expires_at);
CREATE INDEX IF NOT EXISTS theme_chat_attachments_install_idx ON public.theme_chat_attachments (install_id);
ALTER TABLE public.theme_chat_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tca_own ON public.theme_chat_attachments;
DROP POLICY IF EXISTS tca_own_read ON public.theme_chat_attachments;
CREATE POLICY tca_own_read ON public.theme_chat_attachments FOR SELECT USING (install_id IN (SELECT i.id FROM public.store_theme_installs i JOIN public.creators c ON c.id = i.creator_id WHERE c.user_id = auth.uid()));

-- part 35_order_business_details.sql
/* The company a buyer bought for, kept on the order: its legal name, tax number and address, as the checkout checked them (lib/checkout/business.ts). The buyer's invoice and the creator's copy of it read it. Adds one column, empty on every order already there; changes no rows. Written by the server only, as every order column is. Until it runs, orders are made as before and the company is read from the payment instead. */
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_details jsonb;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_business_details_shape') THEN ALTER TABLE public.orders ADD CONSTRAINT orders_business_details_shape CHECK (business_details IS NULL OR (jsonb_typeof(business_details) = 'object' AND pg_column_size(business_details) <= 4096)) NOT VALID; END IF; END $$;

notify pgrst, 'reload schema';
select 'Storelib file 3 of 4 ran. Next file.' as done;

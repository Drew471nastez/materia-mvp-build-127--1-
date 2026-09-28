-- STORELIB DATABASE, FILE 1 of 4
-- Rate limits, newsletter, agent connections and GitHub, refunds recorded once, event and email types, order source, site speed, website addresses, coupons and the admin console, email automations.
-- HOW: select all of this file, copy, paste into a NEW query tab in the Supabase
-- SQL editor, press Run. Run the four files in order, one at a time.
-- Safe to run again: every statement checks before it changes anything, so a
-- second run changes nothing. If Run shows an error, stop and send it; the
-- editor runs the paste as one transaction, so nothing in this file changed.
-- Built from supabase/sql/run-now/ (one statement per line, text unchanged).

set local statement_timeout = 0;
-- the record of which parts ran (part 67)
CREATE TABLE IF NOT EXISTS public.storelib_applied_parts (part text PRIMARY KEY, file text NOT NULL, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL DEFAULT current_user);
ALTER TABLE public.storelib_applied_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_applied_parts FROM anon, authenticated;

-- part 01_rate_limits_and_newsletter.sql
/* Rate limit counter for the open forms, and the storelib.com footer newsletter table. Server only. */
CREATE TABLE IF NOT EXISTS rate_limit_hits ( id BIGSERIAL PRIMARY KEY, bucket TEXT NOT NULL, subject TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup ON rate_limit_hits (bucket, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_sweep ON rate_limit_hits (created_at);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.storelib_newsletter ( id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL UNIQUE, source text NOT NULL DEFAULT 'footer', consent_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz, CONSTRAINT storelib_newsletter_email_len CHECK (char_length(email) BETWEEN 3 AND 254), CONSTRAINT storelib_newsletter_email_lower CHECK (email = lower(email)) );
ALTER TABLE public.storelib_newsletter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_newsletter FROM anon, authenticated;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('01', '01_rate_limits_and_newsletter.sql', '70d91d046d73a2cba376c8836ce23e28ab0d201f373316fb26cf5ed6a489e382') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 02_agent_connections_and_github.sql
/* Agent connections (Claude Code, Codex), their activity log, GitHub sync, and the indexes on them. */
CREATE TABLE IF NOT EXISTS theme_agent_tokens ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), install_id UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE, creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE, name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60), token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ );
CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_install ON theme_agent_tokens (install_id);
ALTER TABLE theme_agent_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators read their own agent connections" ON theme_agent_tokens;
CREATE POLICY "Creators read their own agent connections" ON theme_agent_tokens FOR SELECT USING (creator_id IN (SELECT id FROM creators WHERE user_id = (SELECT auth.uid())));
REVOKE ALL ON theme_agent_tokens FROM anon, authenticated;
GRANT SELECT (id, install_id, creator_id, name, prefix, created_at, last_used_at, revoked_at) ON theme_agent_tokens TO authenticated;
CREATE TABLE IF NOT EXISTS theme_agent_activity ( id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, install_id UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE, token_id UUID REFERENCES theme_agent_tokens(id) ON DELETE SET NULL, agent_name TEXT NOT NULL, path TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('created', 'updated')), created_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_install ON theme_agent_activity (install_id, id);
ALTER TABLE theme_agent_activity ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_agent_activity FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own agent activity" ON theme_agent_activity;
CREATE POLICY "Creators read their own agent activity" ON theme_agent_activity FOR SELECT USING (install_id IN ( SELECT i.id FROM store_theme_installs i JOIN creators c ON c.id = i.creator_id WHERE c.user_id = (SELECT auth.uid()) ));
CREATE TABLE IF NOT EXISTS theme_github_links ( install_id UUID PRIMARY KEY REFERENCES store_theme_installs(id) ON DELETE CASCADE, creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE, installation_id BIGINT NOT NULL, account_login TEXT NOT NULL DEFAULT '', repo_id BIGINT, repo_full_name TEXT, branch TEXT, root_path TEXT NOT NULL DEFAULT '', last_synced_sha TEXT, last_synced_at TIMESTAMPTZ, last_error TEXT, push_on_save BOOLEAN NOT NULL DEFAULT true, pull_on_push BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
ALTER TABLE theme_github_links ADD COLUMN IF NOT EXISTS push_on_save BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE theme_github_links ADD COLUMN IF NOT EXISTS pull_on_push BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_theme_github_links_repo ON theme_github_links (repo_id);
CREATE INDEX IF NOT EXISTS idx_theme_github_links_installation ON theme_github_links (installation_id);
ALTER TABLE theme_github_links ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_github_links FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own GitHub link" ON theme_github_links;
CREATE POLICY "Creators read their own GitHub link" ON theme_github_links FOR SELECT USING (creator_id IN (SELECT id FROM creators WHERE user_id = (SELECT auth.uid())));
CREATE TABLE IF NOT EXISTS theme_github_events ( id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, install_id UUID NOT NULL REFERENCES store_theme_installs(id) ON DELETE CASCADE, direction TEXT NOT NULL CHECK (direction IN ('to_github', 'from_github')), ok BOOLEAN NOT NULL DEFAULT true, summary TEXT NOT NULL CHECK (char_length(summary) <= 300), commit_sha TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS idx_theme_github_events_install ON theme_github_events (install_id, id DESC);
ALTER TABLE theme_github_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON theme_github_events FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own GitHub events" ON theme_github_events;
CREATE POLICY "Creators read their own GitHub events" ON theme_github_events FOR SELECT USING (install_id IN ( SELECT i.id FROM store_theme_installs i JOIN creators c ON c.id = i.creator_id WHERE c.user_id = (SELECT auth.uid()) ));
CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_creator ON theme_agent_tokens (creator_id);
CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_token ON theme_agent_activity (token_id) WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_theme_github_links_creator ON theme_github_links (creator_id);
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('02', '02_agent_connections_and_github.sql', '144eb90c36f0635a9d37fdbc316db1ec83696a5440b4d9e075c3e6027e333270') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 03_refund_recorded_once.sql
/* A Stripe refund is recorded on an order once. If the old webhook ever recorded the same refund twice, this skips itself with a warning instead of failing, and p03 in the check reads false; see README. */
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.ledger_events WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL GROUP BY stripe_refund_id, order_id HAVING count(*) > 1) THEN RAISE WARNING 'part 03 skipped: ledger_events holds the same refund twice on an order, so the refund-once index was not created. Nothing else depends on it. Send the result of: select stripe_refund_id, order_id, count(*) from public.ledger_events where event_type = ''refund'' and stripe_refund_id is not null group by 1, 2 having count(*) > 1;'; ELSE CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_refund_once ON public.ledger_events (stripe_refund_id, order_id) WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL; END IF; END $$;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('03', '03_refund_recorded_once.sql', 'f10d649c49b91c0c1ff1a14d5d09eb53eb9bdfab4261e359d7b9f935e0ca6e19') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 04_event_and_email_types.sql
/* Tracking events and receipt email records the database was refusing. Old rows are not rechecked. */
alter table public.analytics_events drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events add constraint analytics_events_event_type_check check (event_type in ( 'view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart', 'checkout_start', 'buy_click', 'checkout_complete', 'download' )) not valid;
alter table public.email_logs drop constraint if exists email_logs_email_type_check;
alter table public.email_logs add constraint email_logs_email_type_check check (email_type in ('buyer_download', 'seller_notification', 'receipt_resend')) not valid;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('04', '04_event_and_email_types.sql', '740f4f4b1ca760779682f04c5c41d0ec8e99fe0a16c3e1a0de49035cd3b58a30') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 05_order_source.sql
/* Where an order came from (Storelib or a website) and the detail. Marks old basket orders as website. */
alter table public.orders add column if not exists source text;
alter table public.orders add column if not exists source_detail jsonb;
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source is null or source in ('storelib', 'website'));
update public.orders o set source = 'website' where o.source is null and o.stripe_session_id is not null and exists ( select 1 from public.orders other where other.stripe_session_id = o.stripe_session_id and other.id <> o.id );
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('05', '05_order_source.sql', '36c18cc0fdd8caddfea9a15a2d0b1b5ee965dce914d145552b1665b090cd3b8f') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 06_site_vitals.sql
/* Website speed as visitors measured it: the table and its two functions. */
create table if not exists public.site_web_vitals ( id bigint generated always as identity primary key, install_id uuid not null references public.store_theme_installs(id) on delete cascade, creator_id uuid not null references public.creators(id) on delete cascade, day date not null default (now() at time zone 'utc')::date, device text not null check (device in ('mobile', 'desktop')), lcp_ms integer check (lcp_ms between 0 and 60000), inp_ms integer check (inp_ms between 0 and 60000), cls real check (cls between 0 and 10) );
create index if not exists site_web_vitals_install_day on public.site_web_vitals (install_id, day, device);
create index if not exists site_web_vitals_day on public.site_web_vitals (day);
alter table public.site_web_vitals enable row level security;
drop policy if exists "creators read their own site vitals" on public.site_web_vitals;
create policy "creators read their own site vitals" on public.site_web_vitals for select to authenticated using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));
revoke insert, update, delete on public.site_web_vitals from anon, authenticated;
create or replace function public.record_site_vital( p_install uuid, p_creator uuid, p_device text, p_lcp integer, p_inp integer, p_cls real, p_cap integer default 1000 ) returns boolean language plpgsql security definer set search_path = public as $$ declare v_day date := (now() at time zone 'utc')::date; v_seen integer; begin if p_device not in ('mobile', 'desktop') then return false; end if; if p_lcp is null and p_inp is null and p_cls is null then return false; end if; select count(*) into v_seen from ( select 1 from public.site_web_vitals where install_id = p_install and day = v_day and device = p_device limit p_cap ) s; if v_seen >= p_cap then return false; end if; insert into public.site_web_vitals (install_id, creator_id, day, device, lcp_ms, inp_ms, cls) values ( p_install, p_creator, v_day, p_device, case when p_lcp between 0 and 60000 then p_lcp end, case when p_inp between 0 and 60000 then p_inp end, case when p_cls between 0 and 10 then p_cls end ); if random() < 0.001 then delete from public.site_web_vitals where day < v_day - 120; end if; return true; end; $$;
revoke all on function public.record_site_vital(uuid, uuid, text, integer, integer, real, integer) from public, anon, authenticated;
grant execute on function public.record_site_vital(uuid, uuid, text, integer, integer, real, integer) to service_role;
create or replace function public.site_vitals_summary( p_install uuid, p_from date, p_to date ) returns table (metric text, device text, p75 double precision, samples bigint) language sql stable security invoker set search_path = public as $$ with v as ( select device, lcp_ms, inp_ms, cls from public.site_web_vitals where install_id = p_install and day between p_from and p_to ) select 'lcp', v.device, percentile_disc(0.75) within group (order by v.lcp_ms)::double precision, count(v.lcp_ms) from v group by grouping sets ((v.device), ()) union all select 'inp', v.device, percentile_disc(0.75) within group (order by v.inp_ms)::double precision, count(v.inp_ms) from v group by grouping sets ((v.device), ()) union all select 'cls', v.device, percentile_disc(0.75) within group (order by v.cls)::double precision, count(v.cls) from v group by grouping sets ((v.device), ()); $$;
revoke all on function public.site_vitals_summary(uuid, date, date) from public, anon;
grant execute on function public.site_vitals_summary(uuid, date, date) to authenticated, service_role;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('06', '06_site_vitals.sql', 'a2ce702548c5127ca5f5b3f9a73342252b482b7cac213c10fd14a2313c310568') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 07_website_addresses.sql
/* A website's own storelib.com address, apart from the username, and the names it used before. */
create table if not exists public.website_addresses ( creator_id uuid primary key references public.creators(id) on delete cascade, handle text not null unique check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'), updated_at timestamptz not null default now() );
create table if not exists public.website_address_history ( handle text primary key check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'), creator_id uuid not null references public.creators(id) on delete cascade, retired_at timestamptz not null default now() );
create index if not exists website_address_history_creator on public.website_address_history (creator_id);
alter table public.website_addresses enable row level security;
alter table public.website_address_history enable row level security;
drop policy if exists "creators read their own website address" on public.website_addresses;
create policy "creators read their own website address" on public.website_addresses for select to authenticated using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));
revoke insert, update, delete on public.website_addresses from anon, authenticated;
revoke all on public.website_address_history from anon, authenticated;
create or replace function public.website_handle_taken(p_handle text, p_creator uuid default null) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.website_addresses where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator)) or exists (select 1 from public.website_address_history where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator)); $$;
revoke all on function public.website_handle_taken(text, uuid) from public;
grant execute on function public.website_handle_taken(text, uuid) to authenticated;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('07', '07_website_addresses.sql', '781c5b021754b97739942085754b799f4c44c9dd0ae80f9880d5192d8388bc69') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 08_coupons_admin_archive.sql
/* Coupon minimums, the admin console tables and totals, then archived products taken off the page. */
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_purchase_cents integer;
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_min_purchase_cents_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_min_purchase_cents_check CHECK (min_purchase_cents IS NULL OR min_purchase_cents > 0) NOT VALID;
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_usage_limit_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_usage_limit_check CHECK (usage_limit IS NULL OR usage_limit > 0) NOT VALID;
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = coupon_id; $$;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
alter table public.creators add column if not exists banned_at timestamptz;
alter table public.creators add column if not exists banned_reason text;
create index if not exists creators_banned_at_idx on public.creators (banned_at) where banned_at is not null;
create table if not exists public.admin_moderation_log (id uuid primary key default gen_random_uuid(), action text not null, creator_id uuid, user_id uuid, username text, reason text, products_affected int default 0, created_at timestamptz not null default now());
create index if not exists admin_moderation_log_created_idx on public.admin_moderation_log (created_at desc);
alter table public.admin_moderation_log enable row level security;
create table if not exists public.admin_actions (id uuid primary key default gen_random_uuid(), action text not null, target_type text not null, target_id text not null, target_label text, reason text, detail jsonb not null default '{}'::jsonb, actor text not null default 'admin session', created_at timestamptz not null default now());
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);
alter table public.admin_actions enable row level security;
do $$ declare allowed text; begin select string_agg(quote_literal(v), ', ' order by v) into allowed from (select status as v from public.products where status is not null union select unnest(array['draft', 'published', 'unpublished', 'archived'])) s; alter table public.products drop constraint if exists products_status_check; execute format('alter table public.products add constraint products_status_check check (status in (%s)) not valid', allowed); end $$;
create or replace function public.admin_order_totals(p_since timestamptz default null) returns table(order_status text, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select coalesce(o.status, 'unknown'), count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o where p_since is null or o.created_at >= p_since group by coalesce(o.status, 'unknown') $$;
create or replace function public.admin_creator_sales(p_creator_ids uuid[] default null, p_since timestamptz default null, p_limit int default 10) returns table(creator_id uuid, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select p.creator_id, count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o join public.products p on p.id = o.product_id where o.status = 'completed' and (p_creator_ids is null or p.creator_id = any(p_creator_ids)) and (p_since is null or o.created_at >= p_since) group by p.creator_id order by 3 desc limit case when p_creator_ids is null then greatest(coalesce(p_limit, 10), 1) end $$;
create or replace function public.admin_daily_sales(p_days int default 30) returns table(day date, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select (o.created_at at time zone 'utc')::date, count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o where o.status = 'completed' and o.created_at >= ((date_trunc('day', now() at time zone 'utc') at time zone 'utc') - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)) group by 1 order by 1 $$;
revoke all on function public.admin_order_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_creator_sales(uuid[], timestamptz, int) from public, anon, authenticated;
revoke all on function public.admin_daily_sales(int) from public, anon, authenticated;
grant execute on function public.admin_order_totals(timestamptz) to service_role;
grant execute on function public.admin_creator_sales(uuid[], timestamptz, int) to service_role;
grant execute on function public.admin_daily_sales(int) to service_role;
update public.products set status = 'archived' where archived is true and status = 'published';
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('08', '08_coupons_admin_archive.sql', '526b4c42fa9fed7862fcaf5f8e439d9d6879806bdf8edcd0616b2ad04f956972') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 09_email_automation_tables.sql
/* Email automations: runs, jobs and sends tables, their checks, indexes and read policies. */
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source_detail jsonb;
CREATE TABLE IF NOT EXISTS public.email_flow_runs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, dedupe_key text NOT NULL, trigger_type text NOT NULL, status text NOT NULL DEFAULT 'active', current_step_id text, exit_reason text, context jsonb NOT NULL DEFAULT '{}'::jsonb, source_detail jsonb, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_runs DROP CONSTRAINT IF EXISTS email_flow_runs_status_check;
ALTER TABLE public.email_flow_runs ADD CONSTRAINT email_flow_runs_status_check CHECK (status IN ('active', 'completed', 'exited', 'cancelled', 'failed')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_runs_dedupe ON public.email_flow_runs (flow_id, dedupe_key);
CREATE INDEX IF NOT EXISTS email_flow_runs_contact ON public.email_flow_runs (flow_id, email, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_creator_email ON public.email_flow_runs (creator_id, email);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_recent ON public.email_flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_active ON public.email_flow_runs (flow_id) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS public.email_flow_jobs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, after_step_id text, state text NOT NULL DEFAULT 'queued', run_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, last_error text, claimed_by text, claimed_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_jobs DROP CONSTRAINT IF EXISTS email_flow_jobs_state_check;
ALTER TABLE public.email_flow_jobs ADD CONSTRAINT email_flow_jobs_state_check CHECK (state IN ('queued', 'running', 'done', 'failed', 'cancelled')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_jobs_once ON public.email_flow_jobs (run_id, step_id);
CREATE INDEX IF NOT EXISTS email_flow_jobs_due ON public.email_flow_jobs (run_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS email_flow_jobs_leased ON public.email_flow_jobs (claimed_until) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS email_flow_jobs_flow_state ON public.email_flow_jobs (flow_id, state);
CREATE TABLE IF NOT EXISTS public.email_flow_sends ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, email text NOT NULL, subject text, status text NOT NULL DEFAULT 'sending', provider_id text, error text, token uuid NOT NULL DEFAULT gen_random_uuid(), sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_flow_sends DROP CONSTRAINT IF EXISTS email_flow_sends_status_check;
ALTER TABLE public.email_flow_sends ADD CONSTRAINT email_flow_sends_status_check CHECK (status IN ('sending', 'sent', 'failed', 'interrupted')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_once ON public.email_flow_sends (run_id, step_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_token ON public.email_flow_sends (token);
CREATE INDEX IF NOT EXISTS email_flow_sends_flow_step ON public.email_flow_sends (flow_id, step_id);
ALTER TABLE public.email_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_flow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_flow_sends ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_jobs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_flow_sends FROM anon, authenticated;
DROP POLICY IF EXISTS "Creators read their own flow runs" ON public.email_flow_runs;
CREATE POLICY "Creators read their own flow runs" ON public.email_flow_runs FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Creators read their own flow jobs" ON public.email_flow_jobs;
CREATE POLICY "Creators read their own flow jobs" ON public.email_flow_jobs FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Creators read their own flow sends" ON public.email_flow_sends;
CREATE POLICY "Creators read their own flow sends" ON public.email_flow_sends FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.email_flow_runs TO service_role;
GRANT ALL ON public.email_flow_jobs TO service_role;
GRANT ALL ON public.email_flow_sends TO service_role;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('09', '09_email_automation_tables.sql', 'a58c3921a88d2ba5c88e10290c47093048ee1dedac0e079264397dfa2edda3fa') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

-- part 10_email_automation_functions.sql
/* Email automations: enrolling, claiming jobs, health and per step numbers. Needs part 09. */
CREATE OR REPLACE FUNCTION public.enroll_email_flow(p_flow_id uuid, p_creator_id uuid, p_email text, p_name text, p_dedupe_key text, p_window_days integer, p_trigger_type text, p_first_step_id text, p_context jsonb, p_source jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_run uuid; v_email text := lower(trim(p_email)); BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_flow_id::text || ':' || v_email)); IF NOT EXISTS (SELECT 1 FROM email_flows WHERE id = p_flow_id AND creator_id = p_creator_id AND status = 'active') THEN RETURN NULL; END IF; IF p_window_days < 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email) THEN RETURN NULL; END IF; IF p_window_days > 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email AND started_at > now() - make_interval(days => p_window_days)) THEN RETURN NULL; END IF; INSERT INTO email_flow_runs (flow_id, creator_id, email, name, dedupe_key, trigger_type, current_step_id, context, source_detail) VALUES (p_flow_id, p_creator_id, v_email, p_name, p_dedupe_key, p_trigger_type, p_first_step_id, coalesce(p_context, '{}'::jsonb), p_source) ON CONFLICT (flow_id, dedupe_key) DO NOTHING RETURNING id INTO v_run; IF v_run IS NULL THEN RETURN NULL; END IF; INSERT INTO email_flow_jobs (run_id, flow_id, creator_id, step_id, run_at) VALUES (v_run, p_flow_id, p_creator_id, p_first_step_id, now()) ON CONFLICT (run_id, step_id) DO NOTHING; RETURN v_run; END; $$;
REVOKE ALL ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_email_flow_jobs(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 300) RETURNS SETOF public.email_flow_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ UPDATE public.email_flow_jobs j SET state = 'running', claimed_by = p_worker, claimed_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))), attempts = j.attempts + 1, updated_at = now() WHERE j.id IN (SELECT q.id FROM public.email_flow_jobs q WHERE (q.state = 'queued' AND q.run_at <= now()) OR (q.state = 'running' AND q.claimed_until < now()) ORDER BY q.run_at LIMIT greatest(1, least(p_limit, 50)) FOR UPDATE SKIP LOCKED) RETURNING j.*; $$;
REVOKE ALL ON FUNCTION public.claim_email_flow_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_flow_jobs(text, integer, integer) TO service_role;
CREATE OR REPLACE FUNCTION public.email_flow_health() RETURNS TABLE (queued_due bigint, running_stale bigint, failed_last_day bigint, active_without_job bigint, oldest_due timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT (SELECT count(*) FROM email_flow_jobs WHERE state = 'queued' AND run_at <= now()), (SELECT count(*) FROM email_flow_jobs WHERE state = 'running' AND claimed_until < now()), (SELECT count(*) FROM email_flow_jobs WHERE state = 'failed' AND updated_at > now() - interval '1 day'), (SELECT count(*) FROM email_flow_runs r WHERE r.status = 'active' AND r.started_at < now() - interval '1 hour' AND NOT EXISTS (SELECT 1 FROM email_flow_jobs j WHERE j.run_id = r.id AND j.state IN ('queued', 'running'))), (SELECT min(run_at) FROM email_flow_jobs WHERE state = 'queued' AND run_at <= now()); $$;
REVOKE ALL ON FUNCTION public.email_flow_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_flow_health() TO service_role;
CREATE OR REPLACE FUNCTION public.email_flow_step_stats(p_flow_id uuid) RETURNS TABLE (step_id text, sent bigint, opened bigint, clicked bigint, failed bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT s.step_id, count(*) FILTER (WHERE s.status = 'sent'), count(*) FILTER (WHERE s.opened_at IS NOT NULL), count(*) FILTER (WHERE s.clicked_at IS NOT NULL), count(*) FILTER (WHERE s.status IN ('failed', 'interrupted')) FROM public.email_flow_sends s WHERE s.flow_id = p_flow_id GROUP BY s.step_id; $$;
REVOKE ALL ON FUNCTION public.email_flow_step_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_flow_step_stats(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.email_flow_totals() RETURNS TABLE (flow_id uuid, sent bigint, opened bigint, clicked bigint, failed bigint, in_progress bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT f.id, (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.status = 'sent'), (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.opened_at IS NOT NULL), (SELECT count(*) FROM public.email_flow_sends s WHERE s.flow_id = f.id AND s.clicked_at IS NOT NULL), (SELECT count(*) FROM public.email_flow_jobs j WHERE j.flow_id = f.id AND j.state = 'failed'), (SELECT count(*) FROM public.email_flow_runs r WHERE r.flow_id = f.id AND r.status = 'active') FROM public.email_flows f; $$;
REVOKE ALL ON FUNCTION public.email_flow_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_flow_totals() TO authenticated, service_role;
INSERT INTO public.storelib_applied_parts (part, file, sha256) VALUES ('10', '10_email_automation_functions.sql', '70235850df5c3e9ad08f6bdf5a7c229899060deb379dd88d5237a64c08ce4027') ON CONFLICT (part) DO UPDATE SET file = excluded.file, sha256 = excluded.sha256, applied_at = now(), applied_by = current_user;

notify pgrst, 'reload schema';
select 'Storelib file 1 of 4 ran. Next file.' as done;

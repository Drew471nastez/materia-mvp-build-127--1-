/* STORELIB: THIS ROUND'S SQL (coupons, admin console, email automations). Paste all of it into the Supabase SQL editor and press Run. Safe to run more than once. */

/* ---- RUN_COUPONS.sql ---- */
/* RUN_COUPONS: the same as supabase/migrations/20260926_coupon_rules.sql, to paste into the Supabase SQL editor. Safe to run twice. One statement per line. */
/* The minimum order, in cents. lib/checkout/coupons.ts already reads it at checkout; the coupon form writes it. */
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_purchase_cents integer;
/* A minimum is never negative. NOT VALID, so rows already there are not rechecked. */
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_min_purchase_cents_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_min_purchase_cents_check CHECK (min_purchase_cents IS NULL OR min_purchase_cents > 0) NOT VALID;
/* A use limit is a positive number or none. */
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_usage_limit_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_usage_limit_check CHECK (usage_limit IS NULL OR usage_limit > 0) NOT VALID;
/* One use of a code, counted in one statement, so two orders placed together both count. */
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = coupon_id; $$;
/* Only the server may count a use. */
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;
/* Nobody reads another creator's codes: the checkout reads coupons on the server with the service role, so this policy only let anyone holding the public key list every active code. */
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;

/* ---- RUN_ADMIN_CONSOLE.sql ---- */
/* ===========================================================================
   STORELIB ADMIN: WHAT /admin NEEDS FROM THE DATABASE
   Paste the whole thing into the Supabase SQL editor and press Run.
   Safe to run more than once: every line checks before it acts. Nothing here
   deletes or rewrites data you already have. It adds two columns to
   creators, two small tables that only the server can read, and three
   read-only functions that add up orders inside the database.
   ONE STATEMENT PER LINE, on purpose. Let the editor wrap the long ones and
   do not reformat.
   Before this is run, /admin still works: bans say they cannot be recorded
   yet, the Audit view says its table is missing, and the totals are added up
   by the server from the order rows instead of by these functions.
   The last line prints a row of checks. Every value should read true.
   =========================================================================== */
/* 1 of 6  Banning a creator is a fact on the row, not a deletion. Their storefront closes and their products go unpublished; unbanning lifts it. */
alter table public.creators add column if not exists banned_at timestamptz;
alter table public.creators add column if not exists banned_reason text;
create index if not exists creators_banned_at_idx on public.creators (banned_at) where banned_at is not null;
/* 2 of 6  The creator moderation log the ban route has always written to. Service role only: row level security on, no policy. */
create table if not exists public.admin_moderation_log (id uuid primary key default gen_random_uuid(), action text not null, creator_id uuid, user_id uuid, username text, reason text, products_affected int default 0, created_at timestamptz not null default now());
create index if not exists admin_moderation_log_created_idx on public.admin_moderation_log (created_at desc);
alter table public.admin_moderation_log enable row level security;
/* 3 of 6  Every change made from /admin: bans, unpublished products, refunds. Service role only: row level security on, no policy. */
create table if not exists public.admin_actions (id uuid primary key default gen_random_uuid(), action text not null, target_type text not null, target_id text not null, target_label text, reason text, detail jsonb not null default '{}'::jsonb, actor text not null default 'admin session', created_at timestamptz not null default now());
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);
alter table public.admin_actions enable row level security;
/* 4 of 6  Lets a product be "unpublished" by an admin, which is not the same as a draft the creator has not finished. Keeps every status already in use. */
do $$ declare allowed text; begin select string_agg(quote_literal(v), ', ' order by v) into allowed from (select status as v from public.products where status is not null union select unnest(array['draft', 'published', 'unpublished', 'archived'])) s; alter table public.products drop constraint if exists products_status_check; execute format('alter table public.products add constraint products_status_check check (status in (%s)) not valid', allowed); end $$;
/* 5 of 6  Order totals added up inside the database, so the admin never reads every order row to show one number. Readable by the server only. */
create or replace function public.admin_order_totals(p_since timestamptz default null) returns table(order_status text, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select coalesce(o.status, 'unknown'), count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o where p_since is null or o.created_at >= p_since group by coalesce(o.status, 'unknown') $$;
create or replace function public.admin_creator_sales(p_creator_ids uuid[] default null, p_since timestamptz default null, p_limit int default 10) returns table(creator_id uuid, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select p.creator_id, count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o join public.products p on p.id = o.product_id where o.status = 'completed' and (p_creator_ids is null or p.creator_id = any(p_creator_ids)) and (p_since is null or o.created_at >= p_since) group by p.creator_id order by 3 desc limit case when p_creator_ids is null then greatest(coalesce(p_limit, 10), 1) end $$;
create or replace function public.admin_daily_sales(p_days int default 30) returns table(day date, orders bigint, gross_cents bigint, fee_cents bigint) language sql stable set search_path = public as $$ select (o.created_at at time zone 'utc')::date, count(*)::bigint, coalesce(sum(o.amount_cents), 0)::bigint, coalesce(sum(o.fee_cents), 0)::bigint from public.orders o where o.status = 'completed' and o.created_at >= ((date_trunc('day', now() at time zone 'utc') at time zone 'utc') - make_interval(days => greatest(coalesce(p_days, 30), 1) - 1)) group by 1 order by 1 $$;
/* 6 of 6  Platform totals are not for everyone: only the server's service role may call these three. */
revoke all on function public.admin_order_totals(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_creator_sales(uuid[], timestamptz, int) from public, anon, authenticated;
revoke all on function public.admin_daily_sales(int) from public, anon, authenticated;
grant execute on function public.admin_order_totals(timestamptz) to service_role;
grant execute on function public.admin_creator_sales(uuid[], timestamptz, int) to service_role;
grant execute on function public.admin_daily_sales(int) to service_role;
/* Check: every value should read true. */
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'banned_at') as creators_banned_at, to_regclass('public.admin_moderation_log') is not null as admin_moderation_log, to_regclass('public.admin_actions') is not null as admin_actions, to_regprocedure('public.admin_order_totals(timestamptz)') is not null as admin_order_totals, to_regprocedure('public.admin_creator_sales(uuid[], timestamptz, integer)') is not null as admin_creator_sales, to_regprocedure('public.admin_daily_sales(integer)') is not null as admin_daily_sales;

/* ---- RUN_EMAIL_AUTOMATIONS.sql ---- */
/* ===========================================================================
   EMAIL AUTOMATIONS THAT RUN ONCE, AND WHERE A CONTACT CAME FROM
   Paste the whole thing into the Supabase SQL editor and press Run. Safe to
   run more than once: every piece checks before it acts. It adds one column
   to `subscribers`, three tables, and six functions. Nothing is deleted or
   rewritten.
   ONE STATEMENT PER LINE, on purpose. Let the editor wrap the long ones and
   do not reformat them.
   BEFORE THIS RUNS the app keeps working as it did: a flow with emails and
   waits sends through the older queue (scheduled_flow_emails), a flow with a
   check in it does not send at all rather than send to the wrong people, run
   history is empty, and a contact's source is the older one-word source.
   AFTER THIS RUNS every trigger writes a run with a unique key, every step is
   a job that one worker at a time can claim, every email is written down
   before it is sent, and a failure is retried and then kept with its reason.
   The last line prints a row: every number should read 1.
   =========================================================================== */
/* 1 of 7  Where a contact joined: which page, which website, and where the visit came from. Hosts and words only, never a name or an address. Until this runs, the Emails page shows the older coarse source. */
ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source_detail jsonb;
/* 2 of 7  One person going through one flow. The unique (flow_id, dedupe_key) is what turns a second trigger for the same entry into nothing. */
CREATE TABLE IF NOT EXISTS public.email_flow_runs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, dedupe_key text NOT NULL, trigger_type text NOT NULL, status text NOT NULL DEFAULT 'active', current_step_id text, exit_reason text, context jsonb NOT NULL DEFAULT '{}'::jsonb, source_detail jsonb, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_runs DROP CONSTRAINT IF EXISTS email_flow_runs_status_check;
ALTER TABLE public.email_flow_runs ADD CONSTRAINT email_flow_runs_status_check CHECK (status IN ('active', 'completed', 'exited', 'cancelled', 'failed')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_runs_dedupe ON public.email_flow_runs (flow_id, dedupe_key);
CREATE INDEX IF NOT EXISTS email_flow_runs_contact ON public.email_flow_runs (flow_id, email, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_creator_email ON public.email_flow_runs (creator_id, email);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_recent ON public.email_flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS email_flow_runs_flow_active ON public.email_flow_runs (flow_id) WHERE status = 'active';
/* 3 of 7  Each step of a run is one job: queued, running (claimed by one worker until its lease ends), done, failed or cancelled. The unique (run_id, step_id) means a step runs once per person, however often it is queued. */
CREATE TABLE IF NOT EXISTS public.email_flow_jobs ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, after_step_id text, state text NOT NULL DEFAULT 'queued', run_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 5, last_error text, claimed_by text, claimed_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz );
ALTER TABLE public.email_flow_jobs DROP CONSTRAINT IF EXISTS email_flow_jobs_state_check;
ALTER TABLE public.email_flow_jobs ADD CONSTRAINT email_flow_jobs_state_check CHECK (state IN ('queued', 'running', 'done', 'failed', 'cancelled')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_jobs_once ON public.email_flow_jobs (run_id, step_id);
CREATE INDEX IF NOT EXISTS email_flow_jobs_due ON public.email_flow_jobs (run_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS email_flow_jobs_leased ON public.email_flow_jobs (claimed_until) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS email_flow_jobs_flow_state ON public.email_flow_jobs (flow_id, state);
/* 4 of 7  One row per email a run sends, written BEFORE the email goes to Mailgun. The unique (run_id, step_id) is what stops the same email going to the same person twice. The token is the open and click link, and says nothing about the person. */
CREATE TABLE IF NOT EXISTS public.email_flow_sends ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.email_flow_runs(id) ON DELETE CASCADE, flow_id uuid NOT NULL REFERENCES public.email_flows(id) ON DELETE CASCADE, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, step_id text NOT NULL, email text NOT NULL, subject text, status text NOT NULL DEFAULT 'sending', provider_id text, error text, token uuid NOT NULL DEFAULT gen_random_uuid(), sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() );
ALTER TABLE public.email_flow_sends DROP CONSTRAINT IF EXISTS email_flow_sends_status_check;
ALTER TABLE public.email_flow_sends ADD CONSTRAINT email_flow_sends_status_check CHECK (status IN ('sending', 'sent', 'failed', 'interrupted')) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_once ON public.email_flow_sends (run_id, step_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_flow_sends_token ON public.email_flow_sends (token);
CREATE INDEX IF NOT EXISTS email_flow_sends_flow_step ON public.email_flow_sends (flow_id, step_id);
/* 5 of 7  A creator can read their own runs, jobs and sends, for run history and per-step numbers. Nobody but the server writes them. */
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
/* 6 of 7  Entering a flow, in one transaction under a lock per flow and address: the flow must be on, the entry rule is checked (p_window_days: 0 every trigger, -1 once ever, N not within N days), then the run and its first job are written together or not at all. Returns the run, or null when this entry already exists or is not allowed. */
CREATE OR REPLACE FUNCTION public.enroll_email_flow(p_flow_id uuid, p_creator_id uuid, p_email text, p_name text, p_dedupe_key text, p_window_days integer, p_trigger_type text, p_first_step_id text, p_context jsonb, p_source jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_run uuid; v_email text := lower(trim(p_email)); BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_flow_id::text || ':' || v_email)); IF NOT EXISTS (SELECT 1 FROM email_flows WHERE id = p_flow_id AND creator_id = p_creator_id AND status = 'active') THEN RETURN NULL; END IF; IF p_window_days < 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email) THEN RETURN NULL; END IF; IF p_window_days > 0 AND EXISTS (SELECT 1 FROM email_flow_runs WHERE flow_id = p_flow_id AND email = v_email AND started_at > now() - make_interval(days => p_window_days)) THEN RETURN NULL; END IF; INSERT INTO email_flow_runs (flow_id, creator_id, email, name, dedupe_key, trigger_type, current_step_id, context, source_detail) VALUES (p_flow_id, p_creator_id, v_email, p_name, p_dedupe_key, p_trigger_type, p_first_step_id, coalesce(p_context, '{}'::jsonb), p_source) ON CONFLICT (flow_id, dedupe_key) DO NOTHING RETURNING id INTO v_run; IF v_run IS NULL THEN RETURN NULL; END IF; INSERT INTO email_flow_jobs (run_id, flow_id, creator_id, step_id, run_at) VALUES (v_run, p_flow_id, p_creator_id, p_first_step_id, now()) ON CONFLICT (run_id, step_id) DO NOTHING; RETURN v_run; END; $$;
REVOKE ALL ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_email_flow(uuid, uuid, text, text, text, integer, text, text, jsonb, jsonb) TO service_role;
/* 7 of 7  Taking work: due jobs, and jobs whose worker's lease ran out, are claimed with FOR UPDATE SKIP LOCKED, so two workers running at once never take the same job. Then a health reading for the cron's reply, and the per-step numbers the builder shows (read as the creator, so only their own). */
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
/* PostgREST answers from its own cached schema; without this the API keeps saying the new tables and functions do not exist. */
NOTIFY pgrst, 'reload schema';
/* Did it work? Every number should read 1. */
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscribers' AND column_name = 'source_detail') AS subscriber_source, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_flow_runs') AS runs, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_flow_jobs') AS jobs, (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_flow_sends') AS sends, (SELECT count(*) FROM pg_proc WHERE proname = 'enroll_email_flow') AS enroll, (SELECT count(*) FROM pg_proc WHERE proname = 'claim_email_flow_jobs') AS claim, (SELECT count(*) FROM pg_proc WHERE proname = 'email_flow_step_stats') AS step_stats, (SELECT count(*) FROM pg_proc WHERE proname = 'email_flow_totals') AS totals;

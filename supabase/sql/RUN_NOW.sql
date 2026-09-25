/* ===========================================================================
   STORELIB: EVERYTHING STILL TO RUN, IN ONE FILE
   ===========================================================================
   Select all, copy, paste into the Supabase SQL editor, press Run.

   Safe to run more than once, and safe when part of it ran already: every
   statement checks before it acts. Nothing here deletes or rewrites data you
   already have.

   What is in it, in the order it runs:
     1  Website addresses      a website's address can differ from your username
     2  Agent connections      the MCP tables Claude Code and Codex write through
     3  Coupons, admin, email  coupon rules, the admin console, email automations
     4  Safety round           library of 5, archived products leave your page,
                               privacy settings that save, and the storage
                               lock-down (paid files private, owner-only folders)

   Part 4 is the one that matters most: until it runs, anyone holding the
   public key can list and download paid files, and any signed-in account can
   delete other people's files. The app code for it is already live.
   =========================================================================== */


/* =========================== RUN_WEBSITE_ADDRESSES =========================== */
-- ===========================================================================
--  A WEBSITE'S OWN STORELIB ADDRESS, APART FROM ITS CREATOR'S USERNAME
-- ===========================================================================
--  Paste into the Supabase SQL editor and run. The same as
--  supabase/migrations/20260926_website_addresses.sql.
--  Safe to run more than once.
--
--  A website is at <username>.storelib.com until its creator chooses another
--  name in Website Settings › Domains. The chosen name is here, one per
--  creator; a name they move away from is kept in the history, still
--  answering for their site, so links already given out keep working and
--  nobody else can take it over.
--
--  Until this has been run, Website Settings says the address cannot be
--  changed yet, and every site stays at its username. Nothing else depends
--  on it.
-- ===========================================================================

create table if not exists public.website_addresses (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_address_history (
  handle text primary key check (handle ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  creator_id uuid not null references public.creators(id) on delete cascade,
  retired_at timestamptz not null default now()
);

create index if not exists website_address_history_creator on public.website_address_history (creator_id);

alter table public.website_addresses enable row level security;
alter table public.website_address_history enable row level security;

drop policy if exists "creators read their own website address" on public.website_addresses;
create policy "creators read their own website address"
  on public.website_addresses for select
  to authenticated
  using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));

-- No insert, update or delete policy: only the server writes, through the
-- service role, after checking the name is free (app/api/website-address).
revoke insert, update, delete on public.website_addresses from anon, authenticated;
revoke all on public.website_address_history from anon, authenticated;

-- Whether a website already answers to this name, now or from before. Asked
-- by the username form, so a new username never takes a website's address;
-- a yes or a no, and nothing about whose it is.
create or replace function public.website_handle_taken(p_handle text, p_creator uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.website_addresses where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator))
      or exists (select 1 from public.website_address_history where handle = lower(p_handle) and (p_creator is null or creator_id <> p_creator));
$$;

revoke all on function public.website_handle_taken(text, uuid) from public;
grant execute on function public.website_handle_taken(text, uuid) to authenticated;


/* =========================== RUN_AGENT_MCP =========================== */
-- ===========================================================================
--  MCP PAGE TOOLS: THE BUILDER HEARS AN AGENT'S PAGE CHANGES, AND SAYS WHAT
--  THE CREATOR HAS SELECTED
-- ===========================================================================
--  Paste into the Supabase SQL editor and run. The same as supabase/migrations/20260927_agent_mcp.sql.
--  Safe to run more than once.
--
--  1. theme_agent_activity.detail carries the operations an agent applied to
--     a page, so a builder that is open replays them into what it is showing
--     instead of saving over them. Two new actions: 'page' and 'page_created'.
--  2. theme_editor_focus is the page and section the creator has open in the
--     builder, one row per website, for storelib_read_selected_section.
--
--  Until this has been run the MCP page tools answer that they are not
--  switched on yet and write nothing. Section files work as before.
-- ===========================================================================

alter table public.theme_agent_activity add column if not exists detail jsonb;
alter table public.theme_agent_activity drop constraint if exists theme_agent_activity_action_check;
alter table public.theme_agent_activity add constraint theme_agent_activity_action_check check (action in ('created', 'updated', 'page', 'page_created'));

create table if not exists public.theme_editor_focus (
  install_id uuid primary key references public.store_theme_installs(id) on delete cascade,
  page_key text not null check (page_key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  section_id text check (section_id is null or char_length(section_id) <= 128),
  block_id text check (block_id is null or char_length(block_id) <= 128),
  updated_at timestamptz not null default now()
);

alter table public.theme_editor_focus enable row level security;
revoke insert, update, delete on public.theme_editor_focus from anon, authenticated;

drop policy if exists "Creators read their own editor focus" on public.theme_editor_focus;
create policy "Creators read their own editor focus" on public.theme_editor_focus for select to authenticated using (install_id in (select i.id from public.store_theme_installs i join public.creators c on c.id = i.creator_id where c.user_id = (select auth.uid())));


/* =========================== RUN_THIS_ROUND =========================== */
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


/* =========================== RUN_SAFETY_ROUND =========================== */
/* STORELIB: SAFETY ROUND SQL (library limit of 5, product archive status, account privacy, upload and storage safety). Paste all of it into the Supabase SQL editor and press Run. Each part is safe to run more than once and deletes no data. */

/* ---- RUN_THEME_LIBRARY_LIMIT.sql ---- */
-- ===========================================================================
--  Storelib: a library keeps five websites, even when two arrive at once
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Adds a trigger; changes
--  no rows.
--
--  Add theme, Duplicate and Import each count a creator's websites before
--  they insert one. Two of them at the same moment both counted 4 and both
--  inserted, and the library held 6. This makes the database the one that
--  says no: before a website is inserted, it takes a lock for that creator
--  (so their inserts are counted one after another, never side by side),
--  counts, and refuses the insert once there are five.
--
--  The five is lib/website-builder/theme-registry.ts THEME_INSTALL_LIMIT;
--  tests/website-builder.test.ts fails if the two ever differ. The refusal's
--  message is 'library_full', which the routes read as a full library and
--  the page opens its sheet for.
--
--  A library that is already over five from before the limit keeps every
--  website it has: only an insert is checked.
-- ===========================================================================

create or replace function public.store_theme_installs_library_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kept integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('store_theme_installs:' || new.creator_id::text, 0));
  select count(*) into kept from public.store_theme_installs where creator_id = new.creator_id;
  if kept >= 5 then
    raise exception 'library_full'
      using errcode = 'P0001',
            hint = 'A library keeps 5 websites. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
create trigger store_theme_installs_library_limit
  before insert on public.store_theme_installs
  for each row execute function public.store_theme_installs_library_limit();

notify pgrst, 'reload schema';

select exists (
  select 1 from pg_trigger
  where tgname = 'store_theme_installs_library_limit' and not tgisinternal
) as trigger_present;

/* ---- RUN_PRODUCT_ARCHIVE_STATUS.sql ---- */
-- ===========================================================================
--  Storelib: an archived product is off the page
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: a second run changes
--  nothing.
--
--  Archive on the Products page used to set products.archived and leave the
--  status alone. Everything that shows or sells a product asks for
--  status = 'published', so a live product that was archived stayed on the
--  creator's page and in checkout, under a list that said it was off it.
--  Archive now sets status = 'archived' as well (lib/products/archive.ts).
--
--  This puts the products archived the old way where their creator meant
--  them to be: status 'archived', off every page. Restore on the Products
--  page brings one back as a draft. Products the flag does not mark are
--  not touched.
--
--  Needs 'archived' in products_status_check, which
--  supabase/migrations/20260926_admin_console.sql allows. If this fails
--  with a check violation, run that first.
-- ===========================================================================

update public.products
   set status = 'archived'
 where archived is true and status = 'published';

select count(*) as archived_but_published
  from public.products
 where archived is true and status = 'published';

/* ---- RUN_ACCOUNT_PRIVACY.sql ---- */
-- ===========================================================================
--  Storelib: the privacy switch that is saved, and codes that cannot be guessed
-- ===========================================================================
--  Run once in the Supabase SQL editor (supabase/sql/RUN_ACCOUNT_PRIVACY.sql
--  is the same file). Idempotent. Adds three columns; changes no rows.
--
--  1. profiles.personalized_recommendations
--     The "Personalized recommendations" switch in Settings, Privacy. On by
--     default, as it has always behaved. Explore reads it before it builds
--     "For you" from somebody's purchases and wishlist. Written by the person
--     through the profile update policy that already covers their own row.
--
--  2. email_change_codes.current_email_code
--     Changing the account email now needs a code from the NEW address and a
--     code from the CURRENT one, so a session somebody else got hold of cannot
--     move the account to an address they control. Until this column exists
--     the route falls back to the new address's code alone, as before.
--
--  3. email_change_codes.attempts, account_delete_codes.attempts
--     Wrong guesses are counted. After five the code is thrown away and a new
--     one has to be sent, so a six digit code cannot be walked through.
-- ===========================================================================

alter table public.profiles
  add column if not exists personalized_recommendations boolean not null default true;

alter table public.email_change_codes
  add column if not exists current_email_code text;

alter table public.email_change_codes
  add column if not exists attempts integer not null default 0;

alter table public.account_delete_codes
  add column if not exists attempts integer not null default 0;

/* ---- RUN_UPLOAD_SAFETY.sql ---- */
-- ===========================================================================
--  Storelib: uploads and storage that belong to the person who made them
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: every statement can run
--  again. It deletes NO rows and NO files. It changes who may read and write
--  storage, bucket settings, two functions, and adds indexes and functions
--  for the storage cleanup job.
--
--  WHAT WAS WRONG
--
--  1. public.ensure_storage_rls(bucket) was SECURITY DEFINER and granted to
--     every signed in user. It created, for any bucket named, policies that
--     let ANY signed in user read, overwrite and delete every file in it, and
--     let anonymous visitors read it. The upload routes called it on every
--     upload, so they re-created those policies on digital-products, the
--     private bucket that holds paid files, every time a creator uploaded.
--     Result: anybody with the project's public anon key could download or
--     list every paid file, and any account could delete them.
--
--  2. public.fix_storage_bucket_limit(bucket, limit) was granted to every
--     signed in user too, and creates a missing bucket as PUBLIC.
--
--  3. The public picture buckets let any signed in user overwrite or delete
--     any file in them: one person could replace another's avatar or
--     product photos.
--
--  4. digital_assets let a signed in user insert or update rows with any
--     file_path, bucket, size and scan status: point one of their own
--     products at another creator's paid file, mark an infected file clean,
--     or set every size to 0 and have no quota.
--
--  WHAT THIS DOES
--
--  A. Both functions keep their names and arguments (so an old deployment
--     calling them does not error), ensure_storage_rls does nothing, and only
--     the service role may call either.
--  B. digital-products, product-files and digital-assets are private. Anon
--     gets nothing. A signed in person may write exactly one kind of path in
--     digital-products: the one the server reserved for their pending upload
--     (a digital_assets row of theirs names it), which is how a large file
--     goes up in resumable parts. No listing, no reading anybody's finished
--     files, no deleting. The server reaches the buckets with the service
--     role; buyers get five minute signed URLs from /api/download after the
--     purchase is checked.
--  C. The public picture buckets: anybody can VIEW a file by its public URL
--     (that is what a public bucket is, and no policy is needed for it), but
--     only its owner can upload, replace, list or delete, and only under
--     their own folder: the first folder of the path is their user id or
--     their creator id. Nobody can list anybody else's files.
--  D. The picture buckets only take pictures (and videos, where videos go),
--     so an HTML page or an SVG with a script cannot be served from a public
--     URL. Per bucket size limits.
--  E. digital_assets can only be written by the server. Reading is unchanged.
--  F. Storage usage counts uploads in progress, so a started but never
--     finished upload is not free storage.
--  G. Functions the storage cleanup cron (/api/cron/storage-cleanup) uses to
--     find files that no row refers to any more.
--
--  Every policy this removes is named in the output (NOTICE), so nothing is
--  dropped silently.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- A. The two functions any signed in user could call
-- ---------------------------------------------------------------------------
create or replace function public.ensure_storage_rls(p_bucket_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kept so an older deployment that still calls it gets an answer, not an
  -- error. Policies are set by supabase/migrations/20260929_upload_safety.sql.
  return jsonb_build_object('bucket', p_bucket_id, 'created', '[]'::jsonb, 'note', 'policies are managed by migration');
end;
$$;

revoke all on function public.ensure_storage_rls(text) from public, anon, authenticated;
grant execute on function public.ensure_storage_rls(text) to service_role;

create or replace function public.fix_storage_bucket_limit(p_bucket_id text, p_file_size_limit bigint default 0)
returns void
language plpgsql
security definer
set search_path = storage, public
as $$
begin
  -- Changes the size limit of a bucket that exists. Never creates one, never
  -- changes whether it is public, never touches its allowed types.
  update storage.buckets
     set file_size_limit = nullif(p_file_size_limit, 0)
   where id = p_bucket_id;
end;
$$;

revoke all on function public.fix_storage_bucket_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.fix_storage_bucket_limit(text, bigint) to service_role;


-- ---------------------------------------------------------------------------
-- "Is this path mine": the first folder is my user id, or my creator id
-- ---------------------------------------------------------------------------
create or replace function public.storage_owns_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and position('/' in coalesce(p_name, '')) > 1
     and (
       split_part(p_name, '/', 1) = auth.uid()::text
       or exists (
         select 1 from public.creators c
          where c.user_id = auth.uid()
            and c.id::text = split_part(p_name, '/', 1)
       )
     );
$$;

revoke all on function public.storage_owns_path(text) from public, anon;
grant execute on function public.storage_owns_path(text) to authenticated, service_role;

-- "Is this the path the server reserved for my upload": a digital_assets row
-- of mine, still pending, names exactly this path. This is the only way a
-- signed in person can write into the private bucket, and it is what lets a
-- large file go up by TUS in resumable parts (lib/storage/chunked-upload.ts):
-- the server chose the path in /api/v2/upload/prepare, counted it against the
-- quota, and checks the real size and bytes in /complete. Once the upload is
-- completed the path is no longer theirs to write, read or list.
create or replace function public.storage_reserved_upload(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and to_regclass('public.digital_assets') is not null
     and exists (
       select 1 from public.digital_assets da
        where da.file_path = p_name
          and coalesce(da.storage_bucket, 'digital-products') = p_bucket
          and da.uploaded_by = auth.uid()
          and da.upload_status = 'pending'
     );
$$;

revoke all on function public.storage_reserved_upload(text, text) from public, anon;
grant execute on function public.storage_reserved_upload(text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- B, C, D. Buckets and their policies
-- ---------------------------------------------------------------------------
do $$
declare
  private_buckets text[] := array['digital-products', 'product-files', 'digital-assets'];
  public_buckets  text[] := array['product-images', 'avatars', 'covers', 'store-builder-images',
                                  'onepage-assets', 'lead-form-files-v2', 'lead-form-files',
                                  'product-videos', 'email-images'];
  managed text[];
  image_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  video_types text[] := array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mpeg',
                              'video/3gpp', 'video/ogg', 'video/x-matroska', 'video/avi', 'video/mov'];
  -- A link page shares files of every kind, so this list is long; what it
  -- leaves out is anything a browser renders as a page: text/html, SVG, XML
  -- and scripts. application/octet-stream is in, and is always a download.
  lead_types text[] := array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
                             'video/*', 'audio/*', 'font/*',
                             'application/pdf', 'application/zip', 'application/x-zip-compressed',
                             'application/epub+zip', 'application/x-mobipocket-ebook',
                             'application/octet-stream', 'text/plain', 'text/csv', 'text/markdown',
                             'application/rtf', 'application/msword', 'application/vnd.ms-excel',
                             'application/vnd.ms-powerpoint',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                             'application/vnd.oasis.opendocument.text',
                             'application/vnd.oasis.opendocument.spreadsheet',
                             'application/vnd.rar', 'application/x-rar-compressed', 'application/x-7z-compressed',
                             'application/gzip', 'application/x-tar', 'application/json',
                             'image/vnd.adobe.photoshop', 'application/postscript', 'application/illustrator',
                             'model/stl', 'model/obj', 'model/gltf-binary', 'application/x-blender'];
  owner_expr text;
  pol record;
  b text;
  mentions text;
  unmanaged text;
begin
  managed := private_buckets || public_buckets;

  -- The owner column is `owner_id` (text) on current storage, `owner` (uuid)
  -- on older projects. Either is set by storage to the uploader's user id.
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    owner_expr := 'owner_id = (select auth.uid())::text';
  else
    owner_expr := 'owner = (select auth.uid())';
  end if;

  -- Buckets: private ones private, public ones public with type and size limits.
  foreach b in array private_buckets loop
    update storage.buckets set public = false where id = b;
  end loop;
  insert into storage.buckets (id, name, public) values ('digital-products', 'digital-products', false)
    on conflict (id) do update set public = false;

  foreach b in array array['product-images', 'avatars', 'covers', 'store-builder-images', 'onepage-assets',
                           'lead-form-files-v2', 'product-videos', 'email-images'] loop
    insert into storage.buckets (id, name, public) values (b, b, true) on conflict (id) do nothing;
  end loop;

  update storage.buckets set public = true, allowed_mime_types = image_types, file_size_limit = 26214400
   where id in ('product-images', 'avatars', 'covers');
  update storage.buckets set public = true, allowed_mime_types = image_types, file_size_limit = 5242880
   where id = 'email-images';
  update storage.buckets set public = true, allowed_mime_types = image_types || video_types
   where id in ('store-builder-images', 'onepage-assets', 'product-videos');
  update storage.buckets set allowed_mime_types = lead_types
   where id in ('lead-form-files-v2', 'lead-form-files');

  -- Every policy on storage.objects that lets anon or signed in users at a
  -- managed bucket, or at every bucket (no bucket_id in it at all), goes.
  for pol in
    select policyname, roles, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  loop
    continue when pol.roles <@ array['service_role']::name[];
    continue when pol.policyname like 'storelib owner %';

    mentions := null;
    foreach b in array managed loop
      if position(quote_literal(b) in pol.body) > 0 then
        mentions := b;
        exit;
      end if;
    end loop;

    if mentions is not null or position('bucket_id' in pol.body) = 0 then
      select string_agg(distinct m[1], ', ') into unmanaged
        from regexp_matches(pol.body, '''([^'']+)''::text', 'g') as m
       where not (m[1] = any(managed))
         and exists (select 1 from storage.buckets sb where sb.id = m[1]);
      execute format('drop policy %I on storage.objects', pol.policyname);
      raise notice 'dropped storage policy "%" (%, roles %)%', pol.policyname, pol.cmd, pol.roles,
        case when unmanaged is not null then ' - it also named: ' || unmanaged || ', check those buckets still work' else '' end;
    end if;
  end loop;

  -- The owner policies, one set per public bucket. No anon policy: a public
  -- bucket serves its files by URL without one, and a SELECT policy for anon
  -- would only add the ability to LIST everybody's files.
  for pol in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'storelib owner %'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  foreach b in array public_buckets loop

    execute format(
      'create policy %I on storage.objects for select to authenticated using (bucket_id = %L and (public.storage_owns_path(name) or %s))',
      'storelib owner read ' || b, b, owner_expr);
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.storage_owns_path(name))',
      'storelib owner insert ' || b, b);
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (public.storage_owns_path(name) or %s)) with check (bucket_id = %L and (public.storage_owns_path(name) or %s))',
      'storelib owner update ' || b, b, owner_expr, b, owner_expr);
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (public.storage_owns_path(name) or %s))',
      'storelib owner delete ' || b, b, owner_expr);
  end loop;

  -- The private bucket: a signed in person may write one path only, the one
  -- reserved for their pending upload, and read it back while it is pending
  -- (a resumed upload asks how far it got). No delete, no list, nothing else.
  create policy "storelib owner reserved read digital-products" on storage.objects
    for select to authenticated
    using (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
  create policy "storelib owner reserved insert digital-products" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
  create policy "storelib owner reserved update digital-products" on storage.objects
    for update to authenticated
    using (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name))
    with check (bucket_id = 'digital-products' and public.storage_reserved_upload(bucket_id, name));
end;
$$;


-- ---------------------------------------------------------------------------
-- E. digital_assets: written by the server only
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
  role_list text;
begin
  if to_regclass('public.digital_assets') is null then
    raise notice 'skipping digital_assets: the table does not exist here';
    return;
  end if;

  alter table public.digital_assets enable row level security;

  for pol in
    select policyname, roles, cmd, qual
      from pg_policies
     where schemaname = 'public' and tablename = 'digital_assets'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles <@ array['service_role']::name[])
  loop
    execute format('drop policy %I on public.digital_assets', pol.policyname);
    raise notice 'dropped digital_assets policy "%" (%)', pol.policyname, pol.cmd;
    -- An ALL policy also let people READ; that part is kept, as its own policy.
    if pol.cmd = 'ALL' and pol.qual is not null then
      select string_agg(quote_ident(r), ', ') into role_list from unnest(pol.roles) as r;
      if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = left(pol.policyname, 55) || ' (read)') then
        execute format('drop policy %I on public.digital_assets', left(pol.policyname, 55) || ' (read)');
      end if;
      execute format('create policy %I on public.digital_assets for select to %s using (%s)',
                     left(pol.policyname, 55) || ' (read)', role_list, pol.qual);
    end if;
  end loop;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = 'Creators can view their digital_assets') then
    create policy "Creators can view their digital_assets"
      on public.digital_assets for select to authenticated
      using (product_id in (
        select p.id from public.products p
          join public.creators c on p.creator_id = c.id
         where c.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'digital_assets'
                    and policyname = 'Service role full access digital_assets') then
    create policy "Service role full access digital_assets"
      on public.digital_assets for all to service_role using (true) with check (true);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- F. Storage usage counts uploads in progress
-- ---------------------------------------------------------------------------
create or replace function public.get_creator_storage_usage(p_creator_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(da.file_size), 0)::bigint
    from public.digital_assets da
    join public.products p on da.product_id = p.id
   where p.creator_id = p_creator_id
     and coalesce(da.upload_status, 'completed') in ('pending', 'completed');
$$;

-- Somebody else's usage is not a signed in user's business.
revoke all on function public.get_creator_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.get_creator_storage_usage(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- Indexes the upload checks and the cleanup read
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.digital_assets') is not null then
    create index if not exists idx_digital_assets_file_path on public.digital_assets (file_path);
    create index if not exists idx_digital_assets_pending
      on public.digital_assets (created_at) where upload_status in ('pending', 'failed');
    create index if not exists idx_digital_assets_product_status on public.digital_assets (product_id, upload_status);
  end if;
  if to_regclass('public.product_bundles') is not null then
    create index if not exists idx_product_bundles_zip_path on public.product_bundles (zip_path);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- G. What the cleanup job may delete
-- ---------------------------------------------------------------------------
-- Whether any row still refers to a public picture, by its path appearing
-- anywhere in the row. Scoped to the owner the path names (a creator id or a
-- user id), so it reads only that person's rows, in EVERY table that has an
-- owner column: creator_id, owner_id or user_id directly, and product_id,
-- install_id or site_id through the products, theme installs and sites that
-- are theirs. Found by reading the catalogue, so a table added next month is
-- covered without anybody remembering this function. Append-only logs that
-- never hold a picture are skipped because they are the big ones.
--
-- It errs one way only: anything it cannot read (a column of an unexpected
-- type, a path it does not understand) counts as "still referenced", and the
-- file is kept.
create or replace function public.storage_object_referenced(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_key text := split_part(p_name, '/', 1);
  pattern text;
  v_creator uuid;
  v_user uuid;
  t record;
  q text;
  found boolean := false;
  skip text[] := array['rate_limit_hits', 'download_events', 'upload_events', 'product_views',
                       'product_analytics_daily', 'analytics_daily_rollups', 'security_events',
                       'email_events', 'email_logs', 'email_usage', 'ledger_events', 'seller_ledger',
                       'signup_attempts', 'site_web_vitals', 'blog_post_views', 'message_push_log',
                       'flow_execution_log', 'campaign_recipients', 'account_delete_codes',
                       'oauth_bridge_tokens', 'profile_username_history', 'username_history',
                       'website_address_history', 'admin_actions', 'admin_moderation_log'];
begin
  if owner_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return true;
  end if;
  -- LIKE treats _ and % as wildcards; a path is matched as the text it is.
  pattern := '%' || replace(replace(replace(p_name, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select c.id, c.user_id into v_creator, v_user
    from public.creators c
   where c.id = owner_key::uuid or c.user_id = owner_key::uuid
   limit 1;
  if v_creator is null then
    v_user := owner_key::uuid;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select exists (select 1 from public.profiles x where x.id = $1 and x::text like $2)'
      into found using v_user, pattern;
    if found then return true; end if;
  end if;

  for t in
    select c.table_name, c.column_name, (c.data_type = 'uuid') as is_uuid
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name
     where c.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
       and c.column_name in ('creator_id', 'owner_id', 'user_id', 'product_id', 'install_id', 'site_id')
       and not (c.table_name = any(skip))
     order by c.table_name, c.column_name
  loop
    -- A uuid column is compared as a uuid, so its index is used; a column of
    -- any other type is compared as text rather than failing.
    q := case
      when t.column_name = 'creator_id' and v_creator is not null then
        format('select exists (select 1 from public.%I x where x.creator_id%s = $1%s and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name in ('owner_id', 'user_id') and v_user is not null then
        format('select exists (select 1 from public.%I x where x.%I%s = $2%s and x::text like $3)',
               t.table_name, t.column_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'product_id' and v_creator is not null and to_regclass('public.products') is not null then
        format('select exists (select 1 from public.%I x join public.products p on p.id%s = x.product_id%s where p.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'install_id' and v_creator is not null and to_regclass('public.store_theme_installs') is not null then
        format('select exists (select 1 from public.%I x join public.store_theme_installs i on i.id%s = x.install_id%s where i.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      when t.column_name = 'site_id' and v_creator is not null and to_regclass('public.sites') is not null then
        format('select exists (select 1 from public.%I x join public.sites s on s.id%s = x.site_id%s where s.creator_id = $1 and x::text like $3)',
               t.table_name, case when t.is_uuid then '' else '::text' end, case when t.is_uuid then '' else '::text' end)
      else null
    end;
    continue when q is null;
    begin
      execute q into found using v_creator, v_user, pattern;
    exception when others then
      found := true; -- could not read it, so keep the file
    end;
    if found then return true; end if;
  end loop;

  return false;
end;
$$;

revoke all on function public.storage_object_referenced(text, text) from public, anon, authenticated;
grant execute on function public.storage_object_referenced(text, text) to service_role;

-- The candidates, oldest first, at most p_limit. Four kinds, each with its
-- own age and its own test of "nothing refers to it":
--
--   theme-import        a theme package waiting to be imported, older than a
--                       day. The import deletes it when it is done; one still
--                       there was abandoned.
--   digital-orphan      a private file under a creator's digital-products
--                       folder that no digital_assets row names, three days
--                       after it was uploaded.
--   bundle-orphan       a download ZIP no product_bundles row names.
--   description-image   a picture uploaded into a product description that
--                       no longer appears in any of that creator's rows,
--                       fourteen days on.
--   removed-image       a product photo under a creator's product folder that
--                       none of their rows mention any more. Only those
--                       uploaded between p_image_from_days and 30 days ago,
--                       so each run reads a bounded slice; a wider backfill
--                       is a manual run with a larger p_image_from_days.
create or replace function public.storage_cleanup_candidates(p_limit integer default 200, p_image_from_days integer default 32)
returns table (bucket_id text, name text, reason text)
language sql
stable
security definer
set search_path = public, storage
as $$
  with imports as (
    select o.bucket_id::text, o.name::text, 'theme-import'::text as reason, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name ~ '^[0-9a-fA-F-]{36}/theme-imports/[0-9a-fA-F-]{36}\.zip$'
       and o.created_at < now() - interval '1 day'
     order by o.created_at
     limit p_limit
  ),
  digital as (
    select o.bucket_id::text, o.name::text, 'digital-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id in ('digital-products', 'product-files')
       and (o.name like '%/digital-products/%' or o.name like 'products/%')
       and o.created_at < now() - interval '3 days'
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path in (o.name, o.bucket_id || '/' || o.name)
       )
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path like '%://%' and position(o.name in da.file_path) > 0
       )
     order by o.created_at
     limit p_limit
  ),
  bundles as (
    select o.bucket_id::text, o.name::text, 'bundle-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name like '%/bundles/%.zip'
       and o.created_at < now() - interval '3 days'
       and not exists (select 1 from public.product_bundles pb where pb.zip_path = o.name)
     order by o.created_at
     limit p_limit
  ),
  descriptions as (
    select o.bucket_id::text, o.name::text, 'description-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '14 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 15))
       and not public.storage_object_referenced(o.bucket_id, o.name)
     order by o.created_at
     limit p_limit
  ),
  removed as (
    select o.bucket_id::text, o.name::text, 'removed-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name ~ '^[0-9a-fA-F-]{36}/([0-9a-fA-F-]{36}|temp)/'
       and o.name not like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '30 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 31))
       and not public.storage_object_referenced(o.bucket_id, o.name)
     order by o.created_at
     limit p_limit
  )
  select c.bucket_id, c.name, c.reason
    from (
      select * from imports
      union all select * from digital
      union all select * from bundles
      union all select * from descriptions
      union all select * from removed
    ) c
   order by c.created_at
   limit p_limit;
$$;

revoke all on function public.storage_cleanup_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.storage_cleanup_candidates(integer, integer) to service_role;


-- ---------------------------------------------------------------------------
-- H. Pictures uploaded straight from a browser, for the metadata sweep
-- ---------------------------------------------------------------------------
-- Most pictures go from the page straight into a public bucket, so no server
-- sees them on the way. /api/cron/strip-image-metadata reads the recent ones
-- from this list every hour and rewrites any that still carry EXIF, GPS or
-- XMP, at the same URL (lib/storage/metadata-sweep.ts).
create or replace function public.storage_recent_public_images(p_since_minutes integer default 150, p_limit integer default 200)
returns table (bucket_id text, name text, size bigint, mimetype text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id::text, o.name::text,
         coalesce((o.metadata->>'size')::bigint, 0),
         coalesce(o.metadata->>'mimetype', '')
    from storage.objects o
   where o.bucket_id in ('avatars', 'covers', 'product-images', 'store-builder-images',
                         'onepage-assets', 'lead-form-files-v2', 'product-videos')
     and o.created_at > now() - make_interval(mins => greatest(p_since_minutes, 1))
     and lower(coalesce(o.metadata->>'mimetype', '')) in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')
     and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 26214400
   order by o.created_at
   limit greatest(p_limit, 1);
$$;

revoke all on function public.storage_recent_public_images(integer, integer) from public, anon, authenticated;
grant execute on function public.storage_recent_public_images(integer, integer) to service_role;


-- ---------------------------------------------------------------------------
-- What is left. Every row here should be a policy named "storelib owner ..."
-- for a public bucket, or one for a bucket this file does not manage.
-- ---------------------------------------------------------------------------
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;

select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
 order by id;


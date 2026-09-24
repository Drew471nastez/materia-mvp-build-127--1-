/* ===========================================================================
   STORELIB: EVERY DATABASE CHANGE YOU HAVE NOT RUN, IN ONE FILE

   Paste the whole thing into the Supabase SQL editor and press Run.

   Safe to run more than once, and safe when part of it ran already: every
   piece checks before it acts. Nothing here deletes or rewrites data you
   already have. It adds four tables, two columns on `orders`, some indexes,
   and it widens two checks that were refusing valid rows.

   ONE STATEMENT PER LINE, on purpose. A statement split over several lines
   is a statement a copy can break in half, which is what happened last time.
   The lines are long; let the editor wrap them and do not reformat.

   The last line prints a row of counts. Every number should read 1.
   =========================================================================== */

/* 1 of 9  How often a stranger may ask: subscribing, discount codes, password resets, receipts. Without it those forms have no limit at all. */
CREATE TABLE IF NOT EXISTS rate_limit_hits ( id BIGSERIAL PRIMARY KEY, bucket TEXT NOT NULL, subject TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup ON rate_limit_hits (bucket, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_sweep ON rate_limit_hits (created_at);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

/* 2 of 9  Agent connections: the tokens Claude Code and Codex connect with, and their activity log. */
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

/* 3 of 9  GitHub sync: which repository a website is linked to, and what arrived from it. */
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

/* 4 of 9  Indexes for the two above. Nothing waits for these; they keep the lookups fast as the tables grow. */
CREATE INDEX IF NOT EXISTS idx_theme_agent_tokens_creator ON theme_agent_tokens (creator_id);
CREATE INDEX IF NOT EXISTS idx_theme_agent_activity_token ON theme_agent_activity (token_id) WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_theme_github_links_creator ON theme_github_links (creator_id);

/* 5 of 9  A Stripe refund is recorded against an order row once, even when the webhook arrives twice at the same moment. */
CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_refund_once ON public.ledger_events (stripe_refund_id, order_id) WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL;

/* 6 of 9  The Join Our Community box in storelib.com's footer. The server writes it; nobody reads it from a browser. */
CREATE TABLE IF NOT EXISTS public.storelib_newsletter ( id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL UNIQUE, source text NOT NULL DEFAULT 'footer', consent_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz, CONSTRAINT storelib_newsletter_email_len CHECK (char_length(email) BETWEEN 3 AND 254), CONSTRAINT storelib_newsletter_email_lower CHECK (email = lower(email)) );
ALTER TABLE public.storelib_newsletter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_newsletter FROM anon, authenticated;

/* 7 of 9  The database was refusing tracking events (Pressed Buy could only read 0) and receipt email records. This accepts what the app writes. Rows you already have are left alone. */
alter table public.analytics_events drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events add constraint analytics_events_event_type_check check (event_type in ( 'view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart', 'checkout_start', 'buy_click', 'checkout_complete', 'download' )) not valid;
alter table public.email_logs drop constraint if exists email_logs_email_type_check;
alter table public.email_logs add constraint email_logs_email_type_check check (email_type in ('buyer_download', 'seller_notification', 'receipt_resend')) not valid;

/* 8 of 9  Where an order came from: Storelib or a website, plus the detail (which page, where the visit came from, the campaign). */
alter table public.orders add column if not exists source text;
alter table public.orders add column if not exists source_detail jsonb;
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source is null or source in ('storelib', 'website'));
update public.orders o set source = 'website' where o.source is null and o.stripe_session_id is not null and exists ( select 1 from public.orders other where other.stripe_session_id = o.stripe_session_id and other.id <> o.id );

/* 9 of 9  How fast each published website is, as its visitors measured it. Feeds the speed cells on the Website page. */
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

/* The API keeps its own copy of the table list; this tells it to read the new columns. */
notify pgrst, 'reload schema';

/* Did it work? Every number below should read 1. */
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'rate_limit_hits') as rate_limits, (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'theme_agent_tokens') as agent_tokens, (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'theme_github_links') as github_links, (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'ledger_events_refund_once') as refund_once, (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'storelib_newsletter') as newsletter, (select count(*) from pg_constraint where conname = 'analytics_events_event_type_check') as events_check, (select count(*) from pg_constraint where conname = 'email_logs_email_type_check') as email_check, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'source_detail') as order_source, (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'site_web_vitals') as site_speed;

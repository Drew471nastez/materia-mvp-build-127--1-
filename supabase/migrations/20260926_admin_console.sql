/* ===========================================================================
   STORELIB ADMIN: WHAT /admin NEEDS FROM THE DATABASE

   Paste the whole thing into the Supabase SQL editor and press Run.

   Safe to run more than once: every line checks before it acts. Nothing here
   deletes or rewrites data you already have. It adds moderation and audit
   tables, order-total functions, the Health view's error and SQL-part
   records, and the Discover / Explore toggle (platform_settings).

   ONE STATEMENT PER LINE, on purpose. Let the editor wrap the long ones and
   do not reformat.

   Already ran an older copy of this file? Paste supabase/sql/RUN_ADMIN_HEALTH.sql
   instead; it only adds the Health and Discover pieces.

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

/* 7 of 10  Which run-now SQL parts have run on this database (admin Health → Database updates). */
create table if not exists public.storelib_applied_parts (part text primary key, file text not null, sha256 text not null, applied_at timestamptz not null default now(), applied_by text not null default current_user);
alter table public.storelib_applied_parts enable row level security;
revoke all on public.storelib_applied_parts from anon, authenticated;

/* 8 of 10  Error counts and cron run history (admin Health → Errors; lib/observability/report.ts). */
create table if not exists public.error_events (fingerprint text primary key, source text not null, location text not null, message text not null, count bigint not null default 1, first_seen timestamptz not null default now(), last_seen timestamptz not null default now(), last_context jsonb not null default '{}'::jsonb, last_alerted_at timestamptz, resolved_at timestamptz);
create index if not exists error_events_last_seen_idx on public.error_events (last_seen desc);
alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;
create table if not exists public.cron_runs (id bigserial primary key, job text not null, started_at timestamptz not null default now(), finished_at timestamptz, ok boolean, status integer, detail text);
create index if not exists cron_runs_job_idx on public.cron_runs (job, started_at desc);
alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated;
create or replace function public.storelib_note_error(p_fingerprint text, p_source text, p_location text, p_message text, p_context jsonb default '{}'::jsonb, p_alert_every interval default interval '1 hour') returns boolean language plpgsql set search_path = public as $f$ declare told boolean; begin insert into public.error_events as e (fingerprint, source, location, message, last_context) values (p_fingerprint, left(p_source, 40), left(p_location, 300), left(p_message, 2000), coalesce(p_context, '{}'::jsonb)) on conflict (fingerprint) do update set count = e.count + 1, last_seen = now(), message = excluded.message, last_context = excluded.last_context, resolved_at = null; update public.error_events set last_alerted_at = now() where fingerprint = p_fingerprint and (last_alerted_at is null or last_alerted_at < now() - p_alert_every) returning true into told; return coalesce(told, false); end $f$;
create or replace function public.storelib_purge_ops_logs() returns integer language plpgsql set search_path = public as $f$ declare a integer; b integer; begin delete from public.cron_runs where started_at < now() - interval '30 days'; get diagnostics a = row_count; delete from public.error_events where last_seen < now() - interval '90 days'; get diagnostics b = row_count; return a + b; end $f$;
revoke all on function public.storelib_note_error(text, text, text, text, jsonb, interval) from public, anon, authenticated;
grant execute on function public.storelib_note_error(text, text, text, text, jsonb, interval) to service_role;
revoke all on function public.storelib_purge_ops_logs() from public, anon, authenticated;
grant execute on function public.storelib_purge_ops_logs() to service_role;

/* 9 of 10  Platform toggles: Discover / Explore on or off (/admin Health; /api/admin/marketplace-flags). */
create table if not exists public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by text);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
insert into public.platform_settings (key, value) values ('explore_marketplace', 'false'::jsonb) on conflict (key) do nothing;
create or replace function public.explore_marketplace_enabled() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select value::boolean from public.platform_settings where key = 'explore_marketplace'), false); $$;
revoke all on function public.explore_marketplace_enabled() from public;
grant execute on function public.explore_marketplace_enabled() to anon, authenticated;

/* 10 of 10  Check: every value should read true. */
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'banned_at') as creators_banned_at, to_regclass('public.admin_moderation_log') is not null as admin_moderation_log, to_regclass('public.admin_actions') is not null as admin_actions, to_regprocedure('public.admin_order_totals(timestamptz)') is not null as admin_order_totals, to_regprocedure('public.admin_creator_sales(uuid[], timestamptz, integer)') is not null as admin_creator_sales, to_regprocedure('public.admin_daily_sales(integer)') is not null as admin_daily_sales, to_regclass('public.storelib_applied_parts') is not null as storelib_applied_parts, to_regclass('public.error_events') is not null as error_events, to_regclass('public.platform_settings') is not null as platform_settings, to_regprocedure('public.explore_marketplace_enabled()') is not null as explore_marketplace_enabled;
notify pgrst, 'reload schema';

/* ===========================================================================
   STORELIB ADMIN HEALTH (and Discover toggle) ONLY

   Paste into the Supabase SQL editor and press Run.

   Use this when you already ran an older supabase/sql/RUN_ADMIN_CONSOLE.sql
   that did not create error_events, storelib_applied_parts, or
   platform_settings. New databases should run the full RUN_ADMIN_CONSOLE.sql
   instead (it includes everything below).

   Safe to run more than once. The last line should show every value true.
   =========================================================================== */

/* Which run-now SQL parts have run (admin Health → Database updates). */
create table if not exists public.storelib_applied_parts (part text primary key, file text not null, sha256 text not null, applied_at timestamptz not null default now(), applied_by text not null default current_user);
alter table public.storelib_applied_parts enable row level security;
revoke all on public.storelib_applied_parts from anon, authenticated;

/* Error counts and cron run history (admin Health → Errors). */
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

/* Discover / Explore toggle (/admin Health). */
create table if not exists public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now(), updated_by text);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
insert into public.platform_settings (key, value) values ('explore_marketplace', 'false'::jsonb) on conflict (key) do nothing;
create or replace function public.explore_marketplace_enabled() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select value::boolean from public.platform_settings where key = 'explore_marketplace'), false); $$;
revoke all on function public.explore_marketplace_enabled() from public;
grant execute on function public.explore_marketplace_enabled() to anon, authenticated;

select to_regclass('public.storelib_applied_parts') is not null as storelib_applied_parts, to_regclass('public.error_events') is not null as error_events, to_regclass('public.platform_settings') is not null as platform_settings, to_regprocedure('public.explore_marketplace_enabled()') is not null as explore_marketplace_enabled;
notify pgrst, 'reload schema';

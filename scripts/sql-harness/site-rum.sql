-- ===========================================================================
--  PART 210 ON A REAL POSTGRES: ISOLATION, SAMPLING, ROLLUP, RETENTION
-- ===========================================================================
--  Run after supabase-shim.sql on an empty database, as supabase_admin:
--
--    psql -v ON_ERROR_STOP=1 -f scripts/sql-harness/supabase-shim.sql
--    psql -v ON_ERROR_STOP=1 -f scripts/sql-harness/site-rum.sql
--
--  It makes the two tables part 210 points at, runs the part twice (it must
--  be safe to run again), and then checks what the app relies on. Every
--  check is a row in the last result, and a failure raises.
-- ===========================================================================

create table if not exists public.creators (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table if not exists public.store_theme_installs (id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creators(id), status text not null default 'published');
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b1') on conflict do nothing;
insert into public.creators (id, user_id) values ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1') on conflict do nothing;
insert into public.store_theme_installs (id, creator_id) values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000000b') on conflict do nothing;
grant select on public.creators, public.store_theme_installs to authenticated;

-- As the SQL editor runs it: postgres, not a superuser.
alter table public.creators owner to postgres;
alter table public.store_theme_installs owner to postgres;
set role postgres;
\i supabase/sql/run-now/210_site_web_performance.sql
\i supabase/sql/run-now/210_site_web_performance.sql
reset role;

create temp table results (name text, ok boolean, detail text);
grant all on results to anon, authenticated, service_role;

-- ── Writes: only the service role ──────────────────────────────────────────
set role service_role;
select public.record_site_rum('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', '/products/hat', 'product', 'mobile', 'Chrome', 'GB', '4g', 'load', 2100 + g, 120, 0.02, 900, 300, null) from generate_series(1, 30) g;
select public.record_site_rum('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000000b', '/', 'home', 'desktop', 'Safari', 'US', null, 'load', 1500, null, 0, 700, 200, null) from generate_series(1, 25) g;
insert into results select 'the service role records page views', count(*) = 55, count(*)::text from public.site_rum_events;
insert into results select 'every page view arrived is counted', sum(seen) = 55, sum(seen)::text from public.site_rum_counters;
reset role;

-- Sampling: past the full sample the rows carry their weight, and the counter still counts every one.
set role service_role;
select public.record_site_rum('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', '/', 'home', 'mobile', 'Chrome', null, null, 'load', 1000, null, null, null, null, null, 30, 100000, 0.1, 0.01) from generate_series(1, 4000) g;
insert into results
  select 'past the full sample, rows are kept at one in ten with weight 10', bool_and(weight = 10) and count(*) between 320 and 480, count(*)::text
    from public.site_rum_events where install_id = '00000000-0000-4000-8000-0000000000aa' and path = '/' and weight > 1;
insert into results
  select 'the weighted count stands for the page views that arrived (within 15%)', abs(sum(weight) - 4000) < 600, sum(weight)::text
    from public.site_rum_events where install_id = '00000000-0000-4000-8000-0000000000aa' and path = '/';
reset role;

-- ── Reads: creator A sees A, never B ───────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
insert into results select 'creator A reads only A''s page views', count(*) > 0 and bool_and(install_id = '00000000-0000-4000-8000-0000000000aa'), count(*)::text from public.site_rum_events;
insert into results select 'creator A cannot read B''s page views by asking for B', count(*) = 0, count(*)::text from public.site_rum_events where install_id = '00000000-0000-4000-8000-0000000000bb';
insert into results select 'creator A cannot read B''s counters', count(*) = 0, count(*)::text from public.site_rum_counters where install_id = '00000000-0000-4000-8000-0000000000bb';
reset role;
set role authenticated;
do $$ begin
  begin
    perform public.record_site_rum('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000000b', '/', 'home', 'mobile', 'Chrome', null, null, 'load', 1, null, null, null, null, null);
    insert into results values ('a signed in user cannot call the write', false, 'it ran');
  exception when insufficient_privilege then
    insert into results values ('a signed in user cannot call the write', true, 'refused');
  end;
  begin
    insert into public.site_rum_events (install_id, creator_id, path, page_type, device, browser) values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', '/', 'home', 'mobile', 'Chrome');
    insert into results values ('a signed in user cannot insert a page view', false, 'it ran');
  exception when insufficient_privilege then
    insert into results values ('a signed in user cannot insert a page view', true, 'refused');
  end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.site_rum_events;
    insert into results values ('a visitor reads nothing', false, 'it read');
  exception when insufficient_privilege then
    insert into results values ('a visitor reads nothing', true, 'refused');
  end;
end $$;
reset role;

-- ── The rollup: a day replaced whole, twice, is the same day ──────────────
set role service_role;
select public.site_rum_replace_day('00000000-0000-4000-8000-0000000000aa', (now() at time zone 'utc')::date - 1,
  '[{"device":"mobile","dim":"all","key":"","views":30,"samples":30,"lcp_h":[0,0,5,25],"lcp_n":30,"inp_h":[1,2],"inp_n":3,"cls_h":[],"cls_n":0,"fcp_h":[],"fcp_n":0,"ttfb_h":[],"ttfb_n":0,"nav_h":[],"nav_n":0},
    {"device":"mobile","dim":"type","key":"product","views":30,"samples":30,"lcp_h":[0,0,5,25],"lcp_n":30},
    {"device":"tablet","dim":"all","key":"","views":1,"samples":1}]'::jsonb);
create temp table first_run as select * from public.site_rum_daily;
select public.site_rum_replace_day('00000000-0000-4000-8000-0000000000aa', (now() at time zone 'utc')::date - 1,
  '[{"device":"mobile","dim":"all","key":"","views":30,"samples":30,"lcp_h":[0,0,5,25],"lcp_n":30,"inp_h":[1,2],"inp_n":3,"cls_h":[],"cls_n":0,"fcp_h":[],"fcp_n":0,"ttfb_h":[],"ttfb_n":0,"nav_h":[],"nav_n":0},
    {"device":"mobile","dim":"type","key":"product","views":30,"samples":30,"lcp_h":[0,0,5,25],"lcp_n":30},
    {"device":"tablet","dim":"all","key":"","views":1,"samples":1}]'::jsonb);
insert into results
  select 'running a day''s rollup twice leaves the same rows', (select count(*) from public.site_rum_daily) = 2
    and not exists (select device, dim, key, views, samples, lcp_h, lcp_n from public.site_rum_daily except select device, dim, key, views, samples, lcp_h, lcp_n from first_run),
    (select count(*) from public.site_rum_daily)::text;
insert into results select 'a device that is not one is not written', not exists (select 1 from public.site_rum_daily where device = 'tablet'), '';
insert into results select 'histograms keep their order', (select lcp_h from public.site_rum_daily where dim = 'all') = '{0,0,5,25}'::real[], (select lcp_h::text from public.site_rum_daily where dim = 'all');
reset role;

-- The window: summed bucket by bucket, as the asker.
set role service_role;
select public.site_rum_replace_day('00000000-0000-4000-8000-0000000000aa', (now() at time zone 'utc')::date - 2,
  '[{"device":"mobile","dim":"all","key":"","views":10,"samples":10,"lcp_h":[1,1,1,1,6],"lcp_n":10}]'::jsonb);
select public.site_rum_replace_day('00000000-0000-4000-8000-0000000000bb', (now() at time zone 'utc')::date - 2,
  '[{"device":"desktop","dim":"all","key":"","views":99,"samples":99,"lcp_h":[99],"lcp_n":99}]'::jsonb);
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
insert into results
  select 'the window sums histograms bucket by bucket', lcp_h = '{1,1,6,26,6}'::real[] and lcp_n = 40 and views = 40, lcp_h::text || ' n=' || lcp_n
    from public.site_rum_window('00000000-0000-4000-8000-0000000000aa', (now() at time zone 'utc')::date - 7, (now() at time zone 'utc')::date) where dim = 'all';
insert into results
  select 'creator A asking the window for B gets nothing', count(*) = 0, count(*)::text
    from public.site_rum_window('00000000-0000-4000-8000-0000000000bb', (now() at time zone 'utc')::date - 7, (now() at time zone 'utc')::date);
reset role;

-- ── Retention ─────────────────────────────────────────────────────────────
set role service_role;
insert into public.site_rum_events (install_id, creator_id, at, path, page_type, device, browser) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', now() - interval '32 days', '/old-rolled', 'page', 'mobile', 'Chrome'),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', now() - interval '32 days', '/old-not-rolled', 'page', 'mobile', 'Chrome'),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', now() - interval '40 days', '/very-old', 'page', 'mobile', 'Chrome'),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', now() - interval '29 days', '/recent', 'page', 'mobile', 'Chrome');
insert into public.site_rum_counters (install_id, day, creator_id, seen, rolled_at) values ('00000000-0000-4000-8000-0000000000aa', ((now() - interval '32 days') at time zone 'utc')::date, '00000000-0000-4000-8000-00000000000a', 1, now());
delete from public.site_rum_events where path = '/old-not-rolled';
insert into public.site_rum_events (install_id, creator_id, at, path, page_type, device, browser) values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-00000000000b', now() - interval '32 days', '/old-not-rolled', 'page', 'mobile', 'Chrome');
insert into public.site_rum_daily (install_id, creator_id, day, device, dim, key) values
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', (now() at time zone 'utc')::date - 401, 'mobile', 'all', ''),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000000a', (now() at time zone 'utc')::date - 399, 'mobile', 'all', '');
select public.site_rum_cleanup();
insert into results select 'a rolled up day past 30 days is deleted', not exists (select 1 from public.site_rum_events where path = '/old-rolled'), '';
insert into results select 'a day past 30 days that was never rolled up is kept for the rollup', exists (select 1 from public.site_rum_events where path = '/old-not-rolled'), '';
insert into results select 'past 35 days it goes whatever', not exists (select 1 from public.site_rum_events where path = '/very-old'), '';
insert into results select 'under 30 days it stays', exists (select 1 from public.site_rum_events where path = '/recent'), '';
insert into results select 'daily rows past 400 days go, under stay', (select count(*) from public.site_rum_daily where day < (now() at time zone 'utc')::date - 300) = 1, '';
reset role;

select name, ok, detail from results order by ok, name;
do $$ declare bad text; begin
  select string_agg(name, '; ') into bad from results where not ok;
  if bad is not null then raise exception 'site rum checks failed: %', bad; end if;
end $$;

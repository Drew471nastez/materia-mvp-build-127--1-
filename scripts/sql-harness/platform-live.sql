-- Part 477 (platform live), exercised on a production-shaped database by
-- scripts/check-platform-live-sql.sh after the part has run twice. Prints
-- ok or FAIL per line.
\set ON_ERROR_STOP 0
create or replace function pg_temp.plan(q text) returns text language plpgsql as $$ declare r text; acc text := ''; begin for r in execute 'explain ' || q loop acc := acc || r || ' '; end loop; return acc; end $$;
create or replace function pg_temp.say(ok boolean, what text) returns void language plpgsql as $$ begin raise notice '%', (case when ok then 'ok   ' else 'FAIL ' end) || what; end $$;

-- a user for the signed in case
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', 'live-buyer@example.com') on conflict do nothing;

set role service_role;
select pg_temp.say((public.platform_live_ingest('k3j9a8b7c6d5e4f3', '[{"k":"p","a":"explore","p":"/explore","at":"2000-01-01T00:00:00Z"},{"k":"p","a":"creators","p":"/p/blue-brushes"},{"k":"a","a":"creators","p":"/p/blue-brushes","n":"product.view"}]'::jsonb, null, false, null, 'RO', 'phone', 'iOS', 'Safari', 'web', 'google.com')->>'session')::boolean, 'a first batch makes the session');
select pg_temp.say((select pages = 2 and area = 'creators' and path = '/p/blue-brushes' and last_action = 'product.view' and user_id is null and source = 'google.com' and jsonb_array_length(trail) = 2 from public.platform_live_sessions where sid = 'k3j9a8b7c6d5e4f3'), 'the session holds its page, area, action, trail and source, and no account');
select pg_temp.say((select count(*) = 1 from public.platform_live_events where sid = 'k3j9a8b7c6d5e4f3' and name = 'product.view'), 'the action is one event row; pages are not rows');
select pg_temp.say(not (public.platform_live_ingest('k3j9a8b7c6d5e4f3', '[]'::jsonb, null, false, null, 'RO', null, null, null, null, null)->>'session')::boolean, 'a heartbeat inside 55 seconds writes nothing');
update public.platform_live_sessions set last_seen_at = now() - interval '70 seconds' where sid = 'k3j9a8b7c6d5e4f3';
select pg_temp.say((public.platform_live_ingest('k3j9a8b7c6d5e4f3', '[]'::jsonb, null, false, null, 'RO', null, null, null, null, null)->>'session')::boolean, 'a heartbeat after 55 seconds writes the session once');
select pg_temp.say((public.platform_live_ingest('k3j9a8b7c6d5e4f3', '[{"k":"p","a":"checkout","p":"/checkout"}]'::jsonb, null, false, null, 'RO', null, null, null, null, null)->>'session')::boolean, 'a new page inside the window is written (only empty heartbeats wait)');
select pg_temp.say((select source = 'google.com' and area = 'checkout' from public.platform_live_sessions where sid = 'k3j9a8b7c6d5e4f3'), 'the first source is kept');

-- the trail is capped at 40
select public.platform_live_ingest('k3j9a8b7c6d5e4f3', (select jsonb_agg(jsonb_build_object('k','p','a','marketing','p','/blog/post-' || g)) from generate_series(1, 30) g), null, false, null, null, null, null, null, null, null);
select public.platform_live_ingest('k3j9a8b7c6d5e4f3', (select jsonb_agg(jsonb_build_object('k','p','a','marketing','p','/help/q-' || g)) from generate_series(1, 30) g), null, false, null, null, null, null, null, null, null);
select pg_temp.say((select jsonb_array_length(trail) = 40 and trail->39->>2 = '/help/q-30' and pages = 63 from public.platform_live_sessions where sid = 'k3j9a8b7c6d5e4f3'), 'the trail keeps the last 40 pages, newest last; the count keeps them all');

-- a bad batch
select pg_temp.say((public.platform_live_ingest('NOT-A-SID', '[]'::jsonb, null, false, null, null, null, null, null, null, null)->>'session')::boolean is false, 'a malformed session id writes nothing');
select pg_temp.say((public.platform_live_ingest('zzzzzzzzzzzzzzzz', '[{"k":"a","a":"nowhere","n":"cart.add"},{"k":"a","a":"buyer","n":"DROP TABLE"}]'::jsonb, null, false, null, null, null, null, null, null, null)->>'events')::int = 0, 'an action with an unknown area or a bad name is not written');

-- signed in with consent, then the yes taken back
select public.platform_live_ingest('s1s1s1s1s1s1s1s1', '[{"k":"p","a":"buyer","p":"/library"},{"k":"a","a":"buyer","p":"/library","n":"course.open"}]'::jsonb, 'aaaaaaaa-0000-4000-8000-000000000001', true, null, 'DE', 'desktop', 'macOS', 'Chrome', 'web', null);
select pg_temp.say((select user_id is not null and consented from public.platform_live_sessions where sid = 's1s1s1s1s1s1s1s1') and (select user_id is not null from public.platform_live_events where sid = 's1s1s1s1s1s1s1s1' limit 1), 'with consent the session and its actions carry the account');
select public.platform_live_ingest('s1s1s1s1s1s1s1s1', '[]'::jsonb, null, false, null, 'DE', null, null, null, null, null);
select pg_temp.say((select user_id is null and not consented from public.platform_live_sessions where sid = 's1s1s1s1s1s1s1s1') and not exists (select 1 from public.platform_live_events where sid = 's1s1s1s1s1s1s1s1' and user_id is not null), 'consent taken back: the session and its actions lose the account at once');

-- the overview
select pg_temp.say((select (o->>'online')::int = 2 and (o->'areas'->>'checkout')::int = 0 is not true and (o->>'today')::int = 2 and jsonb_array_length(o->'countries_now') = 2 from (select public.platform_live_overview(now() - interval '2 minutes', date_trunc('day', now())) o) x), 'the overview counts online now, by area, today and by country');

-- purge
update public.platform_live_sessions set last_seen_at = now() - interval '8 days', started_at = now() - interval '8 days' where sid = 'k3j9a8b7c6d5e4f3';
update public.platform_live_events set at = now() - interval '31 days' where sid = 'k3j9a8b7c6d5e4f3';
select public.platform_live_ingest('c0c0c0c0c0c0c0c0', '[{"k":"p","a":"marketing","p":"/"}]'::jsonb, null, true, null, null, null, null, null, null, null);
update public.platform_live_sessions set last_seen_at = now() - interval '8 days' where sid = 'c0c0c0c0c0c0c0c0';
select pg_temp.say(public.platform_live_purge(5000) >= 1, 'the purge removes something');
select pg_temp.say(not exists (select 1 from public.platform_live_sessions where sid = 'k3j9a8b7c6d5e4f3') and not exists (select 1 from public.platform_live_events where sid = 'k3j9a8b7c6d5e4f3'), 'an anonymous session after 7 days and actions after 30 are gone');
select pg_temp.say(exists (select 1 from public.platform_live_sessions where sid = 'c0c0c0c0c0c0c0c0'), 'a consenting session is kept to 30 days');
reset role;

-- who may read or write
do $$ begin
  set local role anon;
  perform 1 from public.platform_live_sessions limit 1;
  raise notice 'FAIL anon read the sessions';
exception when insufficient_privilege then raise notice 'ok   anon is refused the sessions';
end $$;
select pg_temp.say(not has_table_privilege('anon', 'public.platform_live_sessions', 'SELECT') and not has_table_privilege('authenticated', 'public.platform_live_events', 'SELECT') and not has_table_privilege('authenticated', 'public.platform_live_sessions', 'INSERT'), 'anon and signed in users have no table rights');
select pg_temp.say(not has_function_privilege('anon', 'public.platform_live_ingest(text, jsonb, uuid, boolean, text, text, text, text, text, text, text)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.platform_live_overview(timestamptz, timestamptz)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.platform_live_purge(integer)', 'EXECUTE'), 'anon and signed in users cannot call the functions');
select pg_temp.say((select relrowsecurity from pg_class where oid = 'public.platform_live_sessions'::regclass) and (select relrowsecurity from pg_class where oid = 'public.platform_live_events'::regclass) and not exists (select 1 from pg_policies where tablename in ('platform_live_sessions', 'platform_live_events')), 'row level security on, no policy');

-- deleting the account removes what was tied to it
select public.platform_live_ingest('s2s2s2s2s2s2s2s2', '[{"k":"p","a":"buyer","p":"/library"}]'::jsonb, 'aaaaaaaa-0000-4000-8000-000000000001', true, null, null, null, null, null, null, null);
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.say(not exists (select 1 from public.platform_live_sessions where sid = 's2s2s2s2s2s2s2s2'), 'an account deleted takes its linked sessions with it');

-- the admin's reads use the indexes
set enable_seqscan = off;
select pg_temp.say(pg_temp.plan($q$select sid from public.platform_live_sessions where last_seen_at >= now() - interval '2 minutes' order by last_seen_at desc limit 100$q$) ~ 'platform_live_sessions_seen_idx', 'who is online reads the last seen index');
select pg_temp.say(pg_temp.plan($q$select id from public.platform_live_events where sid = 'abcdabcdabcdabcd' order by id desc limit 61$q$) ~ 'platform_live_events_sid_idx', 'one session''s actions read the session index');
select pg_temp.say(pg_temp.plan($q$select id from public.platform_live_events where name = 'cart.add' order by id desc limit 51$q$) ~ 'platform_live_events_name_idx', 'the feed by action reads the name index');
select pg_temp.say(pg_temp.plan($q$select id from public.platform_live_events where area = 'checkout' order by id desc limit 51$q$) ~ 'platform_live_events_area_idx', 'the feed by area reads the area index');
select pg_temp.say(pg_temp.plan($q$select count(*) from public.platform_live_sessions where started_at >= now() - interval '1 day'$q$) ~ 'platform_live_sessions_started_idx', 'sessions today read the start index');

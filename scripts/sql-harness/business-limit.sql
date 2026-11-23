-- Part 446 (a login's business limit, set per account) on the local harness database, after the part ran twice. Each line prints ok or FAIL. Run: scripts/check-business-limit-sql.sh
\set ON_ERROR_STOP 1
set client_min_messages = notice;
-- People: ben (002) is the login given an exception; tom (005) keeps the rule; lia (004) owns mara (001) and jsmith (006) and hands mara over.
insert into auth.users (id, email, email_confirmed_at, created_at, aud, role)
select ('00000000-0000-4000-a000-0000000000' || n)::uuid, 'biz' || n || '@example.com', now(), now(), 'authenticated', 'authenticated' from generate_series(11, 29) n on conflict do nothing;
insert into public.business_links (owner_id, member_id) values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001'), ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000006') on conflict do nothing;

create or replace function pg_temp.link(p_owner text, p_member text) returns text language plpgsql as $$
begin
 insert into public.business_links (owner_id, member_id) values (('00000000-0000-4000-a000-0000000000' || p_owner)::uuid, ('00000000-0000-4000-a000-0000000000' || p_member)::uuid);
 return 'linked';
exception when check_violation then return 'refused: ' || sqlerrm;
end $$;
create or replace function pg_temp.say(p_name text, p_ok boolean, p_got text) returns void language plpgsql as $$
begin raise notice '% %: %', case when p_ok then 'ok  ' else 'FAIL' end, p_name, p_got; end $$;

-- The rule, with no row: three a login, the first included.
do $$ declare g text; begin
 perform pg_temp.say('no row reads as three', public.business_limit_of('00000000-0000-4000-a000-000000000005') = 3, public.business_limit_of('00000000-0000-4000-a000-000000000005')::text);
 g := pg_temp.link('05', '21'); perform pg_temp.say('tom: a second business', g = 'linked', g);
 g := pg_temp.link('05', '22'); perform pg_temp.say('tom: a third business', g = 'linked', g);
 g := pg_temp.link('05', '23'); perform pg_temp.say('tom: a fourth is refused', g like 'refused: One login can have at most 3 businesses%', g);
 g := pg_temp.link('02', '11'); g := pg_temp.link('02', '12');
 g := pg_temp.link('02', '13'); perform pg_temp.say('ben without a row: a fourth is refused', g like 'refused:%', g);
end $$;

-- ben's login with no limit (-1).
insert into public.business_limits (user_id, business_limit, note) values ('00000000-0000-4000-a000-000000000002', -1, 'harness') on conflict (user_id) do update set business_limit = excluded.business_limit;
do $$ declare g text; n int; begin
 perform pg_temp.say('-1 reads as -1', public.business_limit_of('00000000-0000-4000-a000-000000000002') = -1, public.business_limit_of('00000000-0000-4000-a000-000000000002')::text);
 foreach g in array array['13', '14', '15', '16', '17', '18', '19', '20'] loop
  if pg_temp.link('02', g) <> 'linked' then perform pg_temp.say('ben unlimited: business ' || g, false, 'refused'); end if;
 end loop;
 select count(*) into n from public.business_links where owner_id = '00000000-0000-4000-a000-000000000002';
 perform pg_temp.say('ben unlimited: eleven businesses on one login', n = 10, (n + 1)::text || ' businesses');
 g := pg_temp.link('05', '24'); perform pg_temp.say('tom is still refused beside him', g like 'refused:%', g);
end $$;

-- A number of its own, then back to the rule.
update public.business_limits set business_limit = 12 where user_id = '00000000-0000-4000-a000-000000000002';
do $$ declare g text; begin
 g := pg_temp.link('02', '25'); perform pg_temp.say('ben at 12: the twelfth', g = 'linked', g);
 g := pg_temp.link('02', '26'); perform pg_temp.say('ben at 12: the thirteenth is refused, with the number', g like 'refused: One login can have at most 12 businesses%', g);
end $$;
update public.business_limits set business_limit = null where user_id = '00000000-0000-4000-a000-000000000002';
do $$ declare g text; begin
 g := pg_temp.link('02', '26'); perform pg_temp.say('ben back to NULL: the rule again, nothing more is added', g like 'refused: One login can have at most 3 businesses%', g);
 perform pg_temp.say('ben back to NULL: the ones made stay', (select count(*) from public.business_links where owner_id = '00000000-0000-4000-a000-000000000002') = 11, 'kept');
end $$;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000027', 0); perform pg_temp.say('0 is refused', false, 'stored'); exception when check_violation then perform pg_temp.say('0 is refused', true, 'check_violation'); end $$;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000027', -2); perform pg_temp.say('-2 is refused', false, 'stored'); exception when check_violation then perform pg_temp.say('-2 is refused', true, 'check_violation'); end $$;

-- The handoff counts to the same number: mara (lia's) to ben, refused at the rule, accepted with -1.
insert into public.business_handoffs (business_user_id, creator_id, from_owner_id, created_by, token_hash, recipient_email, keep_founder, status, expires_at)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', repeat('a', 64), null, false, 'pending', now() + interval '7 days');
do $$ declare hid uuid := (select id from public.business_handoffs where token_hash = repeat('a', 64)); got text := 'accepted'; def text; begin
 def := pg_get_functiondef('public.business_handoff_accept(uuid, text, uuid, text, text, text, text)'::regprocedure);
 perform pg_temp.say('the handoff asks business_limit_of, the fixed 3 gone', position('business_limit_of(p_recipient)' in def) > 0 and position('if 1 + v_count >= 3 then' in def) = 0, 'rewritten');
 begin perform public.business_handoff_accept(hid, repeat('a', 64), '00000000-0000-4000-a000-000000000002', 'ben@example.com', 'lia@example.com', '203.0.113.9', 'test'); exception when others then got := sqlerrm; end;
 perform pg_temp.say('handoff to ben at the rule (eleven already): refused', got = 'handoff_limit', got);
 update public.business_limits set business_limit = -1 where user_id = '00000000-0000-4000-a000-000000000002';
 got := 'accepted';
 begin perform public.business_handoff_accept(hid, repeat('a', 64), '00000000-0000-4000-a000-000000000002', 'ben@example.com', 'lia@example.com', '203.0.113.9', 'test'); exception when others then got := sqlerrm; end;
 perform pg_temp.say('handoff to ben with -1: accepted, the link is his', got = 'accepted' and exists (select 1 from public.business_links where member_id = '00000000-0000-4000-a000-000000000001' and owner_id = '00000000-0000-4000-a000-000000000002'), got);
end $$;

-- Who can read or write the limit.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-4000-a000-000000000005", "role": "authenticated"}';
do $$ begin perform 1 from public.business_limits; perform pg_temp.say('a signed in user cannot read limits', false, 'read'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot read limits', true, 'insufficient_privilege'); end $$;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000005', -1); perform pg_temp.say('a signed in user cannot give themselves no limit (insert)', false, 'inserted'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot give themselves no limit (insert)', true, 'insufficient_privilege'); end $$;
do $$ begin update public.business_limits set business_limit = -1 where user_id = '00000000-0000-4000-a000-000000000005'; perform pg_temp.say('a signed in user cannot change a limit (update)', false, 'updated'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot change a limit (update)', true, 'insufficient_privilege'); end $$;
do $$ begin delete from public.business_limits; perform pg_temp.say('a signed in user cannot delete limits', false, 'deleted'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot delete limits', true, 'insufficient_privilege'); end $$;
do $$ begin perform public.business_limit_of('00000000-0000-4000-a000-000000000002'); perform pg_temp.say('a signed in user cannot call business_limit_of', false, 'called'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot call business_limit_of', true, 'insufficient_privilege'); end $$;
do $$ begin insert into public.business_links (owner_id, member_id) values ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000028'); perform pg_temp.say('a signed in user cannot write business_links', false, 'inserted'); exception when insufficient_privilege then perform pg_temp.say('a signed in user cannot write business_links', true, 'insufficient_privilege'); end $$;
reset role;
set role anon;
do $$ begin perform 1 from public.business_limits; perform pg_temp.say('anon cannot read limits', false, 'read'); exception when insufficient_privilege then perform pg_temp.say('anon cannot read limits', true, 'insufficient_privilege'); end $$;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000005', -1); perform pg_temp.say('anon cannot write limits', false, 'inserted'); exception when insufficient_privilege then perform pg_temp.say('anon cannot write limits', true, 'insufficient_privilege'); end $$;
reset role;
-- Even with a grant someone adds by mistake, row level security with no policy shows and takes nothing.
grant select, insert, update on public.business_limits to authenticated;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select case when count(*) = 0 then 'ok   with a stray grant, row level security still shows a user no row (not even their own)' else 'FAIL a user sees ' || count(*) || ' limit rows' end from public.business_limits;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000005', -1); perform pg_temp.say('with a stray grant, row level security still refuses an insert', false, 'inserted'); exception when insufficient_privilege then perform pg_temp.say('with a stray grant, row level security still refuses an insert', true, sqlerrm); end $$;
reset role;
revoke all on public.business_limits from authenticated;
set role service_role;
do $$ begin insert into public.business_limits (user_id, business_limit) values ('00000000-0000-4000-a000-000000000005', 5) on conflict (user_id) do update set business_limit = excluded.business_limit; perform pg_temp.say('the service role writes a limit', (select business_limit from public.business_limits where user_id = '00000000-0000-4000-a000-000000000005') = 5, '5'); end $$;
reset role;
do $$ declare g text; begin g := pg_temp.link('05', '23'); perform pg_temp.say('tom at 5 from the service role: a fourth now goes in', g = 'linked', g); end $$;
-- What the owner runs for their own login, with an address in place of the placeholder.
insert into public.business_limits (user_id, business_limit) select id, -1 from auth.users where email = 'biz29@example.com' on conflict (user_id) do update set business_limit = excluded.business_limit, updated_at = now();
select case when public.business_limit_of('00000000-0000-4000-a000-000000000029') = -1 then 'ok   the owner''s one line sets -1 by email' else 'FAIL the owner''s one line' end;

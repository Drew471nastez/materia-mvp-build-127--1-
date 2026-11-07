-- Scenarios for business_handoff_accept (supabase/migrations/20271131_business_handoff.sql) on the local harness database. Each line prints ok or FAIL. Run: scripts/check-business-handoff-sql.sh
\set ON_ERROR_STOP 1
set client_min_messages = notice;
-- People: lia (004) is the founder's login, mara (001) the business she built (creator with acct_mara, products),
-- jsmith (006) another business of lia, tom (005) the recipient, ben (002) a recipient at the limit, ioana (003) unverified.
insert into public.business_links (owner_id, member_id) values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001'), ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000006') on conflict do nothing;
insert into auth.users (id, email, email_confirmed_at, created_at, aud, role) values
 ('00000000-0000-4000-a000-000000000011', 'b1@example.com', now(), now(), 'authenticated', 'authenticated'),
 ('00000000-0000-4000-a000-000000000012', 'b2@example.com', now(), now(), 'authenticated', 'authenticated') on conflict do nothing;
insert into public.business_links (owner_id, member_id) values ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000011'), ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000012') on conflict do nothing;
update public.creators set stripe_customer_id = 'cus_founder', stripe_onboarding_status = 'complete', charges_enabled = true, payouts_enabled = true where id = '00000000-0000-4000-b000-000000000001';
insert into public.store_team_members (creator_id, email, user_id, role, status) values ('00000000-0000-4000-b000-000000000001', 'helper@example.com', '00000000-0000-4000-a000-000000000007', 'manager', 'active');
insert into public.push_tokens (user_id, token, platform) values ('00000000-0000-4000-a000-000000000001', 'founder-phone', 'ios');
insert into public.creator_ai_keys (creator_id, provider, sealed_key, key_hint) values ('00000000-0000-4000-b000-000000000001', 'anthropic', repeat('x', 40), '1234');

create or replace function pg_temp.mk(p_hash text, p_email text, p_expires interval, p_status text, p_keep boolean) returns uuid language sql as $$
 insert into public.business_handoffs (business_user_id, creator_id, from_owner_id, created_by, token_hash, recipient_email, keep_founder, status, expires_at)
 values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', p_hash, p_email, p_keep, p_status, now() + p_expires) returning id $$;

create or replace function pg_temp.expect(p_name text, p_handoff uuid, p_hash text, p_recipient uuid, p_email text, p_founder text, p_want text) returns void language plpgsql as $$
declare got text := 'no error';
begin
 begin
  perform public.business_handoff_accept(p_handoff, p_hash, p_recipient, p_email, p_founder, '203.0.113.9', 'test');
 exception when others then got := sqlerrm;
 end;
 raise notice '% %: wanted %, got %', case when got = p_want then 'ok  ' else 'FAIL' end, p_name, p_want, got;
end $$;

do $$
declare hid uuid; good text := repeat('a', 64);
begin
 -- 1 a link that is not there
 hid := pg_temp.mk(repeat('b', 64), null, interval '7 days', 'revoked', false);
 perform pg_temp.expect('wrong token', hid, repeat('c', 64), '00000000-0000-4000-a000-000000000005', 'tom@example.com', null, 'handoff_not_found');
 perform pg_temp.expect('token not hex', hid, 'zz', '00000000-0000-4000-a000-000000000005', 'tom@example.com', null, 'handoff_invalid');
 perform pg_temp.expect('revoked', hid, repeat('b', 64), '00000000-0000-4000-a000-000000000005', 'tom@example.com', null, 'handoff_revoked');
 delete from public.business_handoffs where id = hid;
 hid := pg_temp.mk(repeat('d', 64), null, interval '-1 minute', 'pending', false);
 perform pg_temp.expect('expired', hid, repeat('d', 64), '00000000-0000-4000-a000-000000000005', 'tom@example.com', null, 'handoff_expired');
 delete from public.business_handoffs where id = hid;
 hid := pg_temp.mk(good, 'tom@example.com', interval '7 days', 'pending', true);
 perform pg_temp.expect('wrong email bound', hid, good, '00000000-0000-4000-a000-000000000004', 'lia@example.com', 'lia@example.com', 'handoff_self');
 perform pg_temp.expect('another account than the bound email', hid, good, '00000000-0000-4000-a000-000000000007', 'q8x2kz7v@example.com', 'lia@example.com', 'handoff_wrong_email');
 perform pg_temp.expect('the email passed is not the account''s own', hid, good, '00000000-0000-4000-a000-000000000007', 'tom@example.com', 'lia@example.com', 'handoff_wrong_email');
 perform pg_temp.expect('founder''s own login', hid, good, '00000000-0000-4000-a000-000000000004', 'tom@example.com', 'lia@example.com', 'handoff_self');
 perform pg_temp.expect('founder''s other business', hid, good, '00000000-0000-4000-a000-000000000006', 'tom@example.com', 'lia@example.com', 'handoff_self');
 perform pg_temp.expect('the business itself', hid, good, '00000000-0000-4000-a000-000000000001', 'tom@example.com', 'lia@example.com', 'handoff_self');
 perform pg_temp.expect('a recipient that is a business account', hid, good, '00000000-0000-4000-a000-000000000011', 'tom@example.com', 'lia@example.com', 'handoff_recipient_is_business');
 update public.business_handoffs set recipient_email = null where business_user_id = '00000000-0000-4000-a000-000000000001' and status = 'pending';
 perform pg_temp.expect('a login already at three businesses', hid, good, '00000000-0000-4000-a000-000000000002', 'ben@example.com', 'lia@example.com', 'handoff_limit');
 update public.business_handoffs set recipient_email = 'tom@example.com' where business_user_id = '00000000-0000-4000-a000-000000000001' and status = 'pending';
 insert into public.subscriptions (creator_id, stripe_subscription_id, stripe_customer_id, plan_id, status) values ('00000000-0000-4000-b000-000000000001', 'sub_founder', 'cus_founder', (select id from public.subscription_plans order by id desc limit 1), 'active');
 perform pg_temp.expect('a running paid plan', hid, good, '00000000-0000-4000-a000-000000000005', 'tom@example.com', 'lia@example.com', 'handoff_paid_plan');
 update public.subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_founder';
 perform pg_temp.expect('keep founder with no founder email rolls everything back', hid, good, '00000000-0000-4000-a000-000000000005', 'tom@example.com', '', 'handoff_founder_email');
 raise notice '% rollback: the link is still the founder''s', case when exists (select 1 from public.business_links where member_id = '00000000-0000-4000-a000-000000000001' and owner_id = '00000000-0000-4000-a000-000000000004') then 'ok  ' else 'FAIL' end;
 raise notice '% rollback: payouts untouched', case when (select stripe_account_id from public.creators where id = '00000000-0000-4000-b000-000000000001') = 'acct_mara' then 'ok  ' else 'FAIL' end;
 raise notice '% rollback: the link is still open', case when (select status from public.business_handoffs where id = hid and status = 'pending' limit 1) = 'pending' then 'ok  ' else 'FAIL' end;
end $$;

-- The handoff, accepted.
do $$
declare r jsonb; hid uuid; n_before int; n_after int;
begin
 select h.id into hid from public.business_handoffs h where h.status = 'pending' and h.business_user_id = '00000000-0000-4000-a000-000000000001';
 select count(*) into n_before from public.products where creator_id = '00000000-0000-4000-b000-000000000001';
 r := public.business_handoff_accept(hid, repeat('a', 64), '00000000-0000-4000-a000-000000000005', 'TOM@example.com ', 'Lia@Example.com', '203.0.113.9', 'test');
 raise notice 'result %', r;
 select count(*) into n_after from public.products where creator_id = '00000000-0000-4000-b000-000000000001';
 raise notice '% the link moved to the recipient', case when exists (select 1 from public.business_links where member_id = '00000000-0000-4000-a000-000000000001' and owner_id = '00000000-0000-4000-a000-000000000005') and not exists (select 1 from public.business_links where member_id = '00000000-0000-4000-a000-000000000001' and owner_id = '00000000-0000-4000-a000-000000000004') then 'ok  ' else 'FAIL' end;
 raise notice '% the founder''s other business stays hers', case when exists (select 1 from public.business_links where member_id = '00000000-0000-4000-a000-000000000006' and owner_id = '00000000-0000-4000-a000-000000000004') then 'ok  ' else 'FAIL' end;
 raise notice '% products, creator id, user id and slug unchanged (% and %)', case when n_before = n_after and n_after > 0 and (select user_id::text || slug from public.creators where id = '00000000-0000-4000-b000-000000000001') = '00000000-0000-4000-a000-000000000001mara' then 'ok  ' else 'FAIL' end, n_before, n_after;
 raise notice '% payouts released: no account, previous kept, not charging', case when (select stripe_account_id is null and stripe_previous_account_id = 'acct_mara' and charges_enabled = false and payouts_enabled = false and stripe_onboarding_status = 'not_connected' and stripe_customer_id is null from public.creators where id = '00000000-0000-4000-b000-000000000001') then 'ok  ' else 'FAIL' end;
 raise notice '% the old team cleared, the founder on it with full access', case when (select count(*) from public.store_team_members where creator_id = '00000000-0000-4000-b000-000000000001') = 1 and (select user_id::text || email || status || role || array_to_string(permissions, ',') from public.store_team_members where creator_id = '00000000-0000-4000-b000-000000000001') = '00000000-0000-4000-a000-000000000004lia@example.comactivemanagerwebsite,onepage,creator_pages,products,orders,customers,marketing,community,analytics,settings' then 'ok  ' else 'FAIL' end;
 raise notice '% devices and AI keys gone', case when not exists (select 1 from public.push_tokens where user_id = '00000000-0000-4000-a000-000000000001') and not exists (select 1 from public.creator_ai_keys where creator_id = '00000000-0000-4000-b000-000000000001') then 'ok  ' else 'FAIL' end;
 raise notice '% the link is used, by tom, with an accepted event', case when (select status = 'accepted' and accepted_by = '00000000-0000-4000-a000-000000000005' from public.business_handoffs where id = hid limit 1) and exists (select 1 from public.business_handoff_events e where e.handoff_id = hid and e.event = 'accepted' and e.ip = '203.0.113.9') then 'ok  ' else 'FAIL' end;
 perform pg_temp.expect('the same link again', hid, repeat('a', 64), '00000000-0000-4000-a000-000000000005', 'tom@example.com', 'lia@example.com', 'handoff_used');
end $$;

-- Who can see what.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select 'ok   the business reads its own handoff: ' || count(*) from public.business_handoffs where business_user_id = '00000000-0000-4000-a000-000000000001';
do $$ begin perform token_hash from public.business_handoffs; raise notice 'FAIL the token hash is readable'; exception when insufficient_privilege then raise notice 'ok   the token hash is not readable'; end $$;
do $$ begin perform result from public.business_handoffs; raise notice 'FAIL the result is readable'; exception when insufficient_privilege then raise notice 'ok   the result (old payout ids) is not readable'; end $$;
do $$ begin perform ip from public.business_handoff_events; raise notice 'FAIL ip readable'; exception when insufficient_privilege then raise notice 'ok   event ip is not readable'; end $$;
do $$ begin perform public.business_handoff_accept(gen_random_uuid(), repeat('a', 64), gen_random_uuid(), null, null, null, null); raise notice 'FAIL a signed in user can call the transfer'; exception when insufficient_privilege then raise notice 'ok   a signed in user cannot call the transfer'; end $$;
do $$ begin insert into public.business_handoffs (business_user_id, from_owner_id, token_hash, expires_at) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', repeat('e', 64), now()); raise notice 'FAIL a signed in user can write a handoff'; exception when insufficient_privilege then raise notice 'ok   a signed in user cannot write a handoff'; end $$;
set request.jwt.claims = '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select case when count(*) = 0 then 'ok   a stranger sees no handoff' else 'FAIL a stranger sees ' || count(*) end from public.business_handoffs;
select case when count(*) = 0 then 'ok   a stranger sees no event' else 'FAIL a stranger sees events' end from public.business_handoff_events;
reset role;
set role anon;
do $$ begin perform 1 from public.business_handoffs; raise notice 'FAIL anon reads handoffs'; exception when insufficient_privilege then raise notice 'ok   anon reads nothing'; end $$;
reset role;

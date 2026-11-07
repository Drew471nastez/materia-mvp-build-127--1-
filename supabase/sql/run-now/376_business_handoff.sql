/* Business handoff: a founder gives a business they built for a client (a business account on the founder's login, part 39) to the client's own login, through a claim link. Two new server only tables: business_handoffs (one open claim link per business, only the SHA-256 of its token kept, optionally bound to the recipient's email, an expiry, and whether the founder stays on the team) and business_handoff_events (created, sent, renewed, viewed, accepted, finished, revoked and failed, with who, from where and when). And business_handoff_accept, which hands the business over in one transaction after checking the link, its expiry and single use, the recipient's email, that the recipient is not the founder, and the recipient's three business limit: the business's link in business_links moves from the founder's login to the recipient's and nothing the business owns is rewritten, so its account id, creator id, username, OnePage, store, domains and file paths stay exactly as they are. The founder's payout accounts (Stripe Connect, PayPal, Airwallex), billing customer and saved cards, AI keys, agent and analytics tokens, GitHub link, devices and pending sign in codes are detached from it, its team is cleared, and the founder is added back as a team member only when they chose to stay. A business on a running paid plan or with live paid memberships is refused, so nobody keeps paying for somebody else's business. Any failed check raises and nothing changes. Only the service role may call it. Additive: no existing column changes, and no existing row changes until a handoff is accepted. */
create table if not exists public.business_handoffs (id uuid primary key default gen_random_uuid(), business_user_id uuid not null references auth.users(id) on delete cascade, creator_id uuid references public.creators(id) on delete cascade, from_owner_id uuid not null references auth.users(id) on delete cascade, created_by uuid references auth.users(id) on delete set null, token_hash text not null, recipient_email text, keep_founder boolean not null default false, founder_access text not null default 'full', ttl_days integer not null default 7, status text not null default 'pending', expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_sent_at timestamptz, send_count integer not null default 0, accepted_at timestamptz, accepted_by uuid references auth.users(id) on delete set null, revoked_at timestamptz, revoked_by uuid references auth.users(id) on delete set null, finished_at timestamptz, result jsonb, constraint business_handoffs_token_hash_key unique (token_hash), constraint business_handoffs_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'), constraint business_handoffs_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')), constraint business_handoffs_access_check check (founder_access in ('full', 'content', 'support')), constraint business_handoffs_ttl_check check (ttl_days between 1 and 30), constraint business_handoffs_send_count_check check (send_count between 0 and 1000), constraint business_handoffs_email_check check (recipient_email is null or (recipient_email = lower(recipient_email) and char_length(recipient_email) between 3 and 254 and position('@' in recipient_email) > 1)), constraint business_handoffs_not_self check (business_user_id <> from_owner_id));
create unique index if not exists business_handoffs_one_open on public.business_handoffs (business_user_id) where status = 'pending';
create index if not exists business_handoffs_business_created on public.business_handoffs (business_user_id, created_at desc);
create index if not exists business_handoffs_owner_created on public.business_handoffs (from_owner_id, created_at desc);
create index if not exists business_handoffs_accepted_by on public.business_handoffs (accepted_by, accepted_at desc) where status = 'accepted';
create table if not exists public.business_handoff_events (id bigint generated always as identity primary key, handoff_id uuid references public.business_handoffs(id) on delete set null, business_user_id uuid, event text not null, actor_id uuid, ip text, user_agent text, detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), constraint business_handoff_events_event_check check (event in ('created', 'sent', 'renewed', 'viewed', 'accepted', 'finished', 'revoked', 'failed')), constraint business_handoff_events_ip_check check (ip is null or char_length(ip) <= 64), constraint business_handoff_events_ua_check check (user_agent is null or char_length(user_agent) <= 300));
create index if not exists business_handoff_events_handoff_created on public.business_handoff_events (handoff_id, created_at desc);
create index if not exists business_handoff_events_business_created on public.business_handoff_events (business_user_id, created_at desc);
alter table public.business_handoffs enable row level security;
alter table public.business_handoff_events enable row level security;
revoke all on public.business_handoffs, public.business_handoff_events from public, anon, authenticated;
grant all on public.business_handoffs, public.business_handoff_events to service_role;
grant usage, select on sequence public.business_handoff_events_id_seq to service_role;
grant select (id, business_user_id, creator_id, from_owner_id, recipient_email, keep_founder, founder_access, ttl_days, status, expires_at, created_at, updated_at, last_sent_at, send_count, accepted_at, revoked_at, finished_at) on public.business_handoffs to authenticated;
grant select (id, handoff_id, business_user_id, event, created_at) on public.business_handoff_events to authenticated;
drop policy if exists business_handoffs_owner_read on public.business_handoffs;
create policy business_handoffs_owner_read on public.business_handoffs for select to authenticated using ((select auth.uid()) = business_user_id or (select auth.uid()) = from_owner_id);
drop policy if exists business_handoff_events_owner_read on public.business_handoff_events;
create policy business_handoff_events_owner_read on public.business_handoff_events for select to authenticated using ((select auth.uid()) = business_user_id);
create or replace function public.business_handoff_accept(p_handoff uuid, p_token_hash text, p_recipient uuid, p_recipient_email text, p_founder_email text, p_ip text, p_user_agent text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare
 h public.business_handoffs%rowtype;
 v_creator uuid;
 v_row jsonb := '{}'::jsonb;
 v_stripe text;
 v_email text := lower(btrim(coalesce(p_recipient_email, '')));
 v_auth_email text;
 v_count integer;
 v_n integer;
 v_col text;
 v_val text;
 v_counts jsonb := '{}'::jsonb;
 v_detached jsonb := '{}'::jsonb;
 v_perms text[];
 v_accounts jsonb;
 v_result jsonb;
begin
 if p_handoff is null or p_recipient is null or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
  raise exception 'handoff_invalid' using errcode = '22023';
 end if;
 select * into h from public.business_handoffs where id = p_handoff and token_hash = p_token_hash for update;
 if not found then raise exception 'handoff_not_found' using errcode = 'P0002'; end if;
 if h.status = 'accepted' then raise exception 'handoff_used' using errcode = '55000'; end if;
 if h.status = 'revoked' then raise exception 'handoff_revoked' using errcode = '55000'; end if;
 if h.status = 'expired' or h.expires_at <= now() then raise exception 'handoff_expired' using errcode = '55000'; end if;
 perform 1 from public.business_links where member_id = h.business_user_id and owner_id = h.from_owner_id for update;
 if not found then raise exception 'handoff_stale' using errcode = '55000'; end if;
 if p_recipient = h.business_user_id or p_recipient = h.from_owner_id or exists (select 1 from public.business_links where owner_id = h.from_owner_id and member_id = p_recipient) then
  raise exception 'handoff_self' using errcode = '42501';
 end if;
 if exists (select 1 from public.business_links where member_id = p_recipient) then
  raise exception 'handoff_recipient_is_business' using errcode = '42501';
 end if;
 select lower(u.email) into v_auth_email from auth.users u where u.id = p_recipient;
 if not found then raise exception 'handoff_recipient_missing' using errcode = 'P0002'; end if;
 if v_email <> '' and v_auth_email is distinct from v_email then raise exception 'handoff_wrong_email' using errcode = '42501'; end if;
 if h.recipient_email is not null and v_email is distinct from h.recipient_email then raise exception 'handoff_wrong_email' using errcode = '42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('business_links ' || p_recipient::text, 0));
 select count(*) into v_count from public.business_links where owner_id = p_recipient;
 if 1 + v_count >= 3 then raise exception 'handoff_limit' using errcode = '23514'; end if;
 select c.id into v_creator from public.creators c where c.user_id = h.business_user_id for update;
 if v_creator is not null then
  select to_jsonb(c) into v_row from public.creators c where c.id = v_creator;
  if to_regclass('public.subscriptions') is not null and exists (select 1 from public.subscriptions s where s.creator_id = v_creator and s.stripe_subscription_id is not null and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')) then
   raise exception 'handoff_paid_plan' using errcode = '55000';
  end if;
  if to_regclass('public.memberships') is not null and exists (select 1 from public.memberships m where m.creator_id = v_creator and m.status in ('active', 'trialing', 'past_due')) then
   raise exception 'handoff_live_memberships' using errcode = '55000';
  end if;
 end if;
 delete from public.business_links where member_id = h.business_user_id;
 insert into public.business_links (owner_id, member_id) values (p_recipient, h.business_user_id);
 if v_creator is not null then
  v_stripe := nullif(v_row ->> 'stripe_account_id', '');
  v_detached := jsonb_strip_nulls(jsonb_build_object('stripe_account_id', v_stripe, 'stripe_customer_id', nullif(v_row ->> 'stripe_customer_id', ''), 'paypal_merchant_id', nullif(v_row ->> 'paypal_merchant_id', '')));
  for v_col, v_val in select k, v from (values
   ('stripe_customer_id', null), ('paypal_merchant_id', null)
  ) as t(k, v) loop
   if v_row ? v_col then execute format('update public.creators set %I = %L where id = $1', v_col, v_val) using v_creator; end if;
  end loop;
  if v_stripe is not null then
   for v_col, v_val in select k, v from (values
    ('stripe_account_id', null), ('stripe_onboarding_status', 'not_connected'), ('charges_enabled', 'false'), ('payouts_enabled', 'false'), ('details_submitted', 'false'),
    ('stripe_requirements', '{}'), ('stripe_requirements_due_at', null), ('stripe_requirements_updated_at', now()::text), ('payments_status', 'NOT_STARTED'), ('last_stripe_sync_at', now()::text),
    ('can_accept_payments', 'false'), ('stripe_transfers_status', null), ('stripe_disabled_reason', null), ('stripe_pending_verification', '{}'), ('stripe_eventually_due', '{}'),
    ('stripe_requirement_errors', '{}'), ('payout_destination', null), ('stripe_previous_account_id', v_stripe), ('stripe_account_reset_at', now()::text), ('stripe_account_reset_reason', 'creator_disconnect')
   ) as t(k, v) loop
    if v_row ? v_col then execute format('update public.creators set %I = %L where id = $1', v_col, v_val) using v_creator; end if;
   end loop;
  end if;
  if to_regclass('public.payment_accounts') is not null then
   select coalesce(jsonb_agg(jsonb_build_object('provider', a.provider, 'account', a.provider_account_id, 'status', a.lifecycle_status)), '[]'::jsonb) into v_accounts from public.payment_accounts a where a.creator_id = v_creator;
   if v_accounts <> '[]'::jsonb then v_detached := v_detached || jsonb_build_object('payment_accounts', v_accounts); end if;
   delete from public.payment_accounts where creator_id = v_creator;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('payment_accounts', v_n);
  end if;
  if to_regclass('public.payment_balances') is not null then
   delete from public.payment_balances where creator_id = v_creator;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('payment_balances', v_n);
  end if;
  if to_regclass('public.payment_methods') is not null then
   delete from public.payment_methods where creator_id = v_creator;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('payment_methods', v_n);
  end if;
  if to_regclass('public.creator_ai_keys') is not null then
   delete from public.creator_ai_keys where creator_id = v_creator;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('creator_ai_keys', v_n);
  end if;
  if to_regclass('public.theme_github_links') is not null then
   delete from public.theme_github_links where creator_id = v_creator;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('theme_github_links', v_n);
  end if;
  if to_regclass('public.theme_agent_tokens') is not null then
   update public.theme_agent_tokens set revoked_at = now() where creator_id = v_creator and revoked_at is null;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('theme_agent_tokens', v_n);
  end if;
  if to_regclass('public.analytics_api_tokens') is not null then
   update public.analytics_api_tokens set revoked_at = now() where creator_id = v_creator and revoked_at is null;
   get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('analytics_api_tokens', v_n);
  end if;
 end if;
 if to_regclass('public.store_team_members') is not null then
  delete from public.store_team_members where creator_id = v_creator or user_id = h.business_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('store_team_members', v_n);
 end if;
 if to_regclass('public.push_tokens') is not null then
  delete from public.push_tokens where user_id = h.business_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('push_tokens', v_n);
 end if;
 if to_regclass('public.account_delete_codes') is not null then
  delete from public.account_delete_codes where user_id = h.business_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('account_delete_codes', v_n);
 end if;
 if to_regclass('public.email_change_codes') is not null then
  delete from public.email_change_codes where user_id = h.business_user_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('email_change_codes', v_n);
 end if;
 if to_regclass('public.password_reset_requests') is not null then
  delete from public.password_reset_requests where user_id = h.business_user_id and coalesce(used, false) = false;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('password_reset_requests', v_n);
 end if;
 if to_regclass('public.verification_codes') is not null then
  delete from public.verification_codes where user_id = h.business_user_id and used_at is null;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('verification_codes', v_n);
 end if;
 if h.keep_founder and v_creator is not null then
  if to_regclass('public.store_team_members') is null then raise exception 'handoff_team_missing' using errcode = '55000'; end if;
  if coalesce(p_founder_email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+$' then raise exception 'handoff_founder_email' using errcode = '22023'; end if;
  v_perms := case h.founder_access
   when 'content' then array['website', 'onepage', 'creator_pages', 'products', 'community']
   when 'support' then array['orders', 'customers']
   else array['website', 'onepage', 'creator_pages', 'products', 'orders', 'customers', 'marketing', 'community', 'analytics', 'settings'] end;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_team_members' and column_name = 'permissions') then
   execute 'insert into public.store_team_members (creator_id, email, user_id, role, permissions, status, invited_by, invited_at, accepted_at) values ($1, $2, $3, $4, $5, ''active'', $3, now(), now())'
    using v_creator, lower(btrim(p_founder_email)), h.from_owner_id, case h.founder_access when 'content' then 'staff' else 'manager' end, v_perms;
  else
   insert into public.store_team_members (creator_id, email, user_id, role, status, invited_by, invited_at, accepted_at) values (v_creator, lower(btrim(p_founder_email)), h.from_owner_id, 'manager', 'active', h.from_owner_id, now(), now());
  end if;
 end if;
 v_result := jsonb_build_object('business_user_id', h.business_user_id, 'creator_id', v_creator, 'from_owner_id', h.from_owner_id, 'recipient_id', p_recipient, 'kept_founder', h.keep_founder and v_creator is not null, 'founder_access', h.founder_access, 'cleared', v_counts, 'detached', v_detached);
 update public.business_handoffs set status = 'accepted', accepted_at = now(), accepted_by = p_recipient, updated_at = now(), creator_id = coalesce(v_creator, creator_id), result = v_result where id = h.id;
 insert into public.business_handoff_events (handoff_id, business_user_id, event, actor_id, ip, user_agent, detail) values (h.id, h.business_user_id, 'accepted', p_recipient, left(p_ip, 64), left(p_user_agent, 300), v_result);
 return v_result;
end;
$f$;
revoke all on function public.business_handoff_accept(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.business_handoff_accept(uuid, text, uuid, text, text, text, text) to service_role;
notify pgrst, 'reload schema';

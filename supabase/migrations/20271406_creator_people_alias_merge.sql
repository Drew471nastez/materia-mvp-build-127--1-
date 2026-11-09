/* Contacts, wave 8, part 406 (run after 378): a second business's address is the owner's own with a tag (andrew+slb-1a2b3c4d@gmail.com, lib/businesses/email-alias.ts), and the People list showed the same person twice, once under each. Two helpers, public.storelib_email_match_key(text) (lower case, trimmed, the tag taken off; an address with no inbox, slb-<token>@businesses.invalid, keeps its own name so it joins nobody) and public.storelib_shown_email(text) (the address as it is shown: the tag off, null for one with no inbox). public.creator_people is replaced with the same rule as lib/contacts/identity.ts now has: a row with only an address joins the one account that owns that exact address first, then, when no account owns it exactly, the one account that owns it as shown; otherwise it is one person per address as shown, so the tagged and the plain address are one row. Search reads the address as shown (a tag nobody sees finds nobody; a whole tagged address pasted still does). Same signature, still service role only and filtered by p_creator. No table or row changes. Safe to run again. */
create or replace function public.storelib_email_match_key(p text) returns text language sql immutable parallel safe as $f$ select case when p is null or btrim(p) = '' then null when lower(btrim(p)) like '%@businesses.invalid' then lower(btrim(p)) else regexp_replace(lower(btrim(p)), '\+slb-[0-9a-f]{8}(?=@)', '') end $f$;
create or replace function public.storelib_shown_email(p text) returns text language sql immutable parallel safe as $f$ select case when p is null or btrim(p) = '' then null when lower(btrim(p)) like '%@businesses.invalid' then null when position('@' in p) = 0 then null else regexp_replace(btrim(p), '\+slb-[0-9a-f]{8}(?=@)', '', 'i') end $f$;
create or replace function public.creator_people(p_creator uuid, p_filter text default 'all', p_q text default null, p_sort text default 'recent', p_limit integer default 50, p_offset integer default 0, p_adv jsonb default '{}'::jsonb, p_ids text[] default null) returns jsonb language plpgsql stable security definer set search_path = public as $f$
declare
  v_owner uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 200000);
  v_q text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_adv jsonb := case when jsonb_typeof(p_adv) = 'object' then p_adv else '{}'::jsonb end;
  v_filter text := case when p_filter in ('all', 'leads', 'customers', 'subscribers', 'members') then p_filter else 'all' end;
  v_sort text := case when p_sort in ('recent', 'newest', 'oldest', 'name') then p_sort else 'recent' end;
  v_from timestamptz;
  v_to timestamptz;
  v_epoch timestamptz := 'epoch'::timestamptz;
  v_out jsonb;
begin
  if p_creator is null then return jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'counts', jsonb_build_object('all', 0, 'leads', 0, 'customers', 0, 'subscribers', 0, 'members', 0)); end if;
  select c.user_id into v_owner from public.creators c where c.id = p_creator;
  begin v_from := case when v_adv->>'from' ~ '^\d{4}-\d{2}-\d{2}$' then ((v_adv->>'from')::date)::timestamp at time zone 'UTC' end; exception when others then v_from := null; end;
  begin v_to := case when v_adv->>'to' ~ '^\d{4}-\d{2}-\d{2}$' then ((v_adv->>'to')::date + 1)::timestamp at time zone 'UTC' end; exception when others then v_to := null; end;
  with src as (
    select 'c'::text as k, cc.id::text as rid, cc.user_id as uid, public.storelib_normal_email(cc.email_normalized) as em, nullif(left(btrim(coalesce(cc.name, '')), 120), '') as nm, cc.created_at as at, null::text as st, null::boolean as act, false as paid, false as live, null::text as cid, null::text as tid, null::text as mst, null::text as lst, coalesce(cc.tags, '{}'::text[]) as tg, case when cc.source = 'import' then 'import' else 'manual' end as org
      from public.creator_contacts cc where cc.creator_id = p_creator
    union all
    select 's', s.id::text, null::uuid, public.storelib_normal_email(s.email), nullif(left(btrim(coalesce(s.name, '')), 120), ''), coalesce(s.subscribed_at, s.created_at), s.status, s.is_active, false, false, null, null, null, null, coalesce(s.tags, '{}'::text[]),
      coalesce(case when s.source_detail->>'surface' in ('website', 'profile', 'onepage', 'product', 'checkout', 'import', 'manual', 'api') then s.source_detail->>'surface' end, case when s.source_detail ? 'site' then 'website' end, case s.source when 'onepage' then 'onepage' when 'onepage_email_capture' then 'onepage' when 'website_builder_newsletter' then 'website' when 'store_builder' then 'website' when 'contact_form' then 'website' when 'creator_page' then 'profile' when 'checkout' then 'checkout' end, 'unknown')
      from public.subscribers s where s.creator_id = p_creator
    union all
    select 'k', cu.id::text, null::uuid, public.storelib_normal_email(cu.email), nullif(left(btrim(concat_ws(' ', nullif(btrim(cu.first_name), ''), nullif(btrim(cu.last_name), ''))), 120), ''), cu.created_at, null, null, false, false, null, null, null, null, '{}'::text[], 'checkout'
      from public.customers cu where cu.creator_id = p_creator
    union all
    select 'o', o.id::text, o.buyer_id, public.storelib_normal_email(o.buyer_email), nullif(left(btrim(concat_ws(' ', nullif(btrim(o.buyer_first_name), ''), nullif(btrim(o.buyer_last_name), ''))), 120), ''), o.created_at, null, null, true, false, null, null, null, null, '{}'::text[], 'checkout'
      from public.orders o where o.creator_id = p_creator and o.status in ('completed', 'refunded', 'partially_refunded')
    union all
    select 'b', m.id::text, m.buyer_id, public.storelib_normal_email(m.buyer_email), nullif(left(btrim(coalesce(m.buyer_name, '')), 120), ''), m.created_at, null, null, false, m.status in ('active', 'trialing', 'past_due'), null, null, null, null, '{}'::text[], 'checkout'
      from public.memberships m where m.creator_id = p_creator
    union all
    select 'g', cm.id::text, cm.user_id, null, null, coalesce(cm.joined_at, cm.created_at), null, null, false, cm.status = 'active', lower(cm.community_id::text), lower(cm.tier_id::text), cm.status, null, '{}'::text[], 'community'
      from public.community_members cm join public.communities co on co.id = cm.community_id where co.creator_id = p_creator and cm.role <> 'owner'
    union all
    select 'e', ce.id::text, ce.buyer_id, null, null, ce.started_at, null, null, false, false, null, null, null, null, '{}'::text[], 'checkout'
      from public.course_enrollments ce join public.products pr on pr.id = ce.product_id where pr.creator_id = p_creator
    union all
    select 'f', fs.id::text, null::uuid, public.storelib_normal_email(fs.contact_email), nullif(left(btrim(coalesce(fs.contact_name, '')), 120), ''), fs.submitted_at, null, null, false, false, null, null, null, fs.status, '{}'::text[], 'form'
      from public.form_submissions fs where v_owner is not null and fs.owner_id = v_owner
    union all
    select 'l', ol.id::text, null::uuid, public.storelib_normal_email(ol.email), nullif(left(btrim(coalesce(ol.name, '')), 120), ''), ol.created_at, null, null, false, false, null, null, null, null, '{}'::text[], 'onepage'
      from public.onepage_leads ol join public.onepages op on op.id = ol.onepage_id where op.seller_id = p_creator or op.creator_id = p_creator
    union all
    select 'm', sm.id::text, null::uuid, public.storelib_normal_email(sm.email), nullif(left(btrim(coalesce(sm.name, '')), 120), ''), sm.created_at, null, null, false, false, null, null, null, null, '{}'::text[], 'website'
      from public.site_contact_messages sm where sm.creator_id = p_creator and coalesce(sm.page, '') <> '__reply'
  ),
  acct as (
    select p.id as uid, public.storelib_normal_email(p.email) as em, coalesce(p.email_verified, false) as ver, coalesce(nullif(left(btrim(coalesce(p.display_name, '')), 120), ''), nullif(left(btrim(coalesce(p.username, '')), 120), '')) as nm
      from public.profiles p where p.id in (select distinct uid from src where uid is not null)
  ),
  pairs as (
    select uid, em from acct where ver and em is not null
    union
    select uid, em from src where uid is not null and em is not null and k in ('o', 'b')
  ),
  owners as (select em, count(distinct uid) as n, (array_agg(distinct uid))[1] as uid from pairs group by em),
  shown_owners as (select public.storelib_email_match_key(em) as sk, (array_agg(distinct uid))[1] as uid from pairs group by 1 having count(distinct uid) = 1),
  keyed as (
    select s.*, case when s.uid is not null then 'u:' || s.uid::text when s.em is not null and ow.n = 1 then 'u:' || ow.uid::text when s.em is not null and ow.em is null and so.uid is not null then 'u:' || so.uid::text when s.em is not null then 'e:' || public.storelib_email_match_key(s.em) else 'r:' || s.k || ':' || s.rid end as ident,
      case s.k when 's' then 1 when 'k' then 2 when 'o' then 3 when 'b' then 4 when 'f' then 5 when 'l' then 6 when 'm' then 7 when 'g' then 8 when 'e' then 9 else 10 end as prio
      from src s left join owners ow on s.uid is null and ow.em = s.em left join shown_owners so on s.uid is null and s.em is not null and ow.em is null and so.sk = public.storelib_email_match_key(s.em)
  ),
  grouped as (
    select k.ident,
      case when k.ident like 'u:%' then substr(k.ident, 3) end as user_id,
      (array_agg(k.rid order by coalesce(k.at, v_epoch), k.rid collate "C") filter (where k.k = 'c'))[1] as contact_rid,
      (array_agg(k.k || '_' || k.rid order by k.prio, coalesce(k.at, v_epoch), k.rid collate "C"))[1] as first_key,
      (array_agg(k.em order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'c' and k.em is not null))[1] as em_c,
      (array_agg(k.em order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 's' and k.em is not null))[1] as em_s,
      (array_agg(k.em order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.em is not null))[1] as em_any,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'c' and k.nm is not null))[1] as nm_c,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 's' and k.nm is not null))[1] as nm_s,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'k' and k.nm is not null))[1] as nm_k,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'o' and k.nm is not null))[1] as nm_o,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'b' and k.nm is not null))[1] as nm_b,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'f' and k.nm is not null))[1] as nm_f,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'l' and k.nm is not null))[1] as nm_l,
      (array_agg(k.nm order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 'm' and k.nm is not null))[1] as nm_m,
      (array_agg(case when k.st in ('bounced', 'complained', 'suppressed') then 'blocked' when k.st = 'unsubscribed' then 'unsubscribed' when k.st = 'subscribed' then case when k.act is false then 'unsubscribed' else 'subscribed' end else 'none' end order by coalesce(k.at, v_epoch) desc, k.rid collate "C") filter (where k.k = 's'))[1] as sub_state,
      (array_agg(k.org order by coalesce(k.at, v_epoch), k.rid collate "C"))[1] as origin,
      min(k.at) as first_seen, max(k.at) as last_seen,
      bool_or((k.k = 'o' and k.paid) or k.k = 'k') as customer,
      bool_or(k.k in ('g', 'b') and k.live) as member,
      bool_or(k.k in ('f', 'l', 'm')) as any_lead,
      bool_or(k.k = 'e') as student,
      bool_or(k.k = 'c') as has_contact,
      count(*) filter (where k.k = 'o' and k.paid) as orders,
      count(*) filter (where k.k = 'f') as forms,
      array_remove(array_agg(distinct k.cid) filter (where k.k = 'g'), null) as communities,
      array_remove(array_agg(distinct k.tid) filter (where k.k = 'g'), null) as tiers,
      array_remove(array_agg(distinct k.mst) filter (where k.k = 'g'), null) as access,
      array_remove(array_agg(distinct k.lst) filter (where k.k = 'f'), null) as lead_statuses
    from keyed k group by k.ident
  ),
  tagged as (
    select d.ident, array_agg(d.t order by d.t collate "C") as tags from (select distinct k.ident, u.t from keyed k cross join lateral unnest(k.tg) as u(t) where k.k in ('c', 's') and u.t is not null and u.t <> '') d group by d.ident
  ),
  people as (
    select
      case when g.contact_rid is not null then 'c_' || g.contact_rid when g.user_id is not null then 'u_' || g.user_id else g.first_key end as id,
      g.user_id,
      coalesce(g.em_c, g.em_s, case when a.ver then a.em end, g.em_any, a.em) as email,
      coalesce(g.nm_c, g.nm_s, g.nm_k, g.nm_o, g.nm_b, g.nm_f, g.nm_l, g.nm_m, a.nm) as name,
      g.first_seen, g.last_seen,
      g.any_lead and not g.customer as lead, g.customer, coalesce(g.sub_state, 'none') = 'subscribed' as subscriber, g.member, g.student,
      coalesce(g.sub_state, 'none') as subscription, coalesce(g.origin, 'unknown') as origin, g.orders, g.forms, coalesce(tg.tags[1:50], '{}'::text[]) as tags,
      coalesce(g.communities, '{}'::text[]) as communities, coalesce(g.tiers, '{}'::text[]) as tiers, coalesce(g.access, '{}'::text[]) as access, coalesce(g.lead_statuses, '{}'::text[]) as lead_statuses, g.has_contact
    from grouped g left join acct a on g.user_id is not null and a.uid::text = g.user_id left join tagged tg on tg.ident = g.ident
  ),
  matched as (
    select p.* from people p
    where case when p_ids is not null then p.id = any(p_ids) else
      (v_q is null or position(v_q in lower(coalesce(p.name, ''))) > 0 or position(v_q in coalesce(public.storelib_shown_email(p.email), '')) > 0 or (position('+slb-' in v_q) > 0 and position(v_q in coalesce(p.email, '')) > 0))
      and (v_adv->>'origin' is null or p.origin = v_adv->>'origin')
      and (v_adv->>'tag' is null or exists (select 1 from unnest(p.tags) t where lower(t) = lower(v_adv->>'tag')))
      and (v_adv->>'sub' is null or p.subscription = v_adv->>'sub')
      and (v_adv->>'community' is null or (v_adv->>'community') = any(p.communities))
      and (v_adv->>'tier' is null or (v_adv->>'tier') = any(p.tiers))
      and (v_adv->>'access' is null or (v_adv->>'access') = any(p.access))
      and (v_adv->>'bought' is null or (v_adv->>'bought' = 'yes') = p.customer)
      and (v_adv->>'forms' is null or (v_adv->>'forms' = 'yes') = (p.forms > 0))
      and (v_adv->>'course' is null or (v_adv->>'course' = 'yes') = p.student)
      and (v_adv->>'lead' is null or (v_adv->>'lead') = any(p.lead_statuses))
      and (v_from is null or (p.first_seen is not null and p.first_seen >= v_from))
      and (v_to is null or p.first_seen is null or p.first_seen < v_to)
    end
  ),
  chosen as (
    select m.* from matched m
    where p_ids is not null or v_filter = 'all' or (v_filter = 'leads' and m.lead) or (v_filter = 'customers' and m.customer) or (v_filter = 'subscribers' and m.subscriber) or (v_filter = 'members' and m.member)
  ),
  page as (
    select c.* from chosen c
    order by
      case when v_sort = 'recent' then c.last_seen end desc nulls last,
      case when v_sort = 'newest' then c.first_seen end desc nulls last,
      case when v_sort = 'oldest' then c.first_seen end asc nulls first,
      case when v_sort = 'name' then lower(coalesce(nullif(c.name, ''), c.email, '~')) end collate "C" asc,
      c.id collate "C" asc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'userId', x.user_id, 'email', x.email, 'name', x.name, 'firstSeen', x.first_seen, 'lastSeen', x.last_seen, 'lead', x.lead, 'customer', x.customer, 'subscriber', x.subscriber, 'member', x.member, 'student', x.student, 'subscription', x.subscription, 'origin', x.origin, 'orders', x.orders, 'forms', x.forms, 'tags', to_jsonb(x.tags), 'communities', to_jsonb(x.communities), 'tiers', to_jsonb(x.tiers), 'access', to_jsonb(x.access), 'leadStatuses', to_jsonb(x.lead_statuses), 'hasContact', x.has_contact)
      order by case when v_sort = 'recent' then x.last_seen end desc nulls last, case when v_sort = 'newest' then x.first_seen end desc nulls last, case when v_sort = 'oldest' then x.first_seen end asc nulls first, case when v_sort = 'name' then lower(coalesce(nullif(x.name, ''), x.email, '~')) end collate "C" asc, x.id collate "C" asc) from page x), '[]'::jsonb),
    'total', (select count(*) from chosen),
    'counts', (select jsonb_build_object('all', count(*), 'leads', count(*) filter (where lead), 'customers', count(*) filter (where customer), 'subscribers', count(*) filter (where subscriber), 'members', count(*) filter (where member)) from matched)
  ) into v_out;
  return v_out;
end $f$;
revoke all on function public.creator_people(uuid, text, text, text, integer, integer, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.creator_people(uuid, text, text, text, integer, integer, jsonb, text[]) to service_role;
comment on function public.creator_people(uuid, text, text, text, integer, integer, jsonb, text[]) is 'Contacts: one page of a creator''s people, joined from the source tables by account and given address, a second business''s tagged address keyed and searched as the address it is shown as (lib/contacts/identity.ts, part 406), with counts for the five filters. Service role only; every read is filtered by p_creator.';
notify pgrst, 'reload schema';

-- ===========================================================================
--  HOW FAST EACH PUBLISHED WEBSITE IS, AS ITS VISITORS MEASURED IT
-- ===========================================================================
--  The same as supabase/sql/RUN_SITE_VITALS.sql, for `supabase db push`.
--  Safe to run more than once.
--
--  Until it has been run, published sites still send their measurements,
--  the ingest route (app/api/public/vitals) drops them, and the Website page
--  shows "Collecting data" in the LCP, INP and CLS cells. Nothing else on the
--  page depends on it.
--
--  One row per measured page load: the site, the day, phone or computer, and
--  up to three numbers. Nothing about the visitor. At most p_cap rows per
--  site, per device, per day (the route asks for 1000), and rows older than
--  120 days are cleared as new ones arrive, so the table stays small however
--  busy the sites get.
-- ===========================================================================

create table if not exists public.site_web_vitals (
  id bigint generated always as identity primary key,
  install_id uuid not null references public.store_theme_installs(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  device text not null check (device in ('mobile', 'desktop')),
  lcp_ms integer check (lcp_ms between 0 and 60000),
  inp_ms integer check (inp_ms between 0 and 60000),
  cls real check (cls between 0 and 10)
);

create index if not exists site_web_vitals_install_day
  on public.site_web_vitals (install_id, day, device);
create index if not exists site_web_vitals_day
  on public.site_web_vitals (day);

-- ── Who can read it: a creator, their own sites, nothing else ─────────────
alter table public.site_web_vitals enable row level security;

drop policy if exists "creators read their own site vitals" on public.site_web_vitals;
create policy "creators read their own site vitals"
  on public.site_web_vitals for select
  to authenticated
  using (creator_id in (select c.id from public.creators c where c.user_id = auth.uid()));

-- No insert, update or delete policy: only the server writes, through the
-- function below, with the service role.
revoke insert, update, delete on public.site_web_vitals from anon, authenticated;

-- ── The write: capped per site, device and day ────────────────────────────
create or replace function public.record_site_vital(
  p_install uuid,
  p_creator uuid,
  p_device text,
  p_lcp integer,
  p_inp integer,
  p_cls real,
  p_cap integer default 1000
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_seen integer;
begin
  if p_device not in ('mobile', 'desktop') then return false; end if;
  if p_lcp is null and p_inp is null and p_cls is null then return false; end if;

  select count(*) into v_seen from (
    select 1 from public.site_web_vitals
     where install_id = p_install and day = v_day and device = p_device
     limit p_cap
  ) s;
  if v_seen >= p_cap then return false; end if;

  insert into public.site_web_vitals (install_id, creator_id, day, device, lcp_ms, inp_ms, cls)
  values (
    p_install, p_creator, v_day, p_device,
    case when p_lcp between 0 and 60000 then p_lcp end,
    case when p_inp between 0 and 60000 then p_inp end,
    case when p_cls between 0 and 10 then p_cls end
  );

  -- One call in a thousand clears what nothing will read again.
  if random() < 0.001 then
    delete from public.site_web_vitals where day < v_day - 120;
  end if;
  return true;
end;
$$;

revoke all on function public.record_site_vital(uuid, uuid, text, integer, integer, real, integer) from public, anon, authenticated;
grant execute on function public.record_site_vital(uuid, uuid, text, integer, integer, real, integer) to service_role;

-- ── The read: 75th percentile per metric, per device and overall ─────────
-- SECURITY INVOKER, so the policy above decides which rows it can see: a
-- creator asking about somebody else's site gets nothing back.
create or replace function public.site_vitals_summary(
  p_install uuid,
  p_from date,
  p_to date
) returns table (metric text, device text, p75 double precision, samples bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with v as (
    select device, lcp_ms, inp_ms, cls
      from public.site_web_vitals
     where install_id = p_install and day between p_from and p_to
  )
  select 'lcp', v.device, percentile_disc(0.75) within group (order by v.lcp_ms)::double precision, count(v.lcp_ms)
    from v group by grouping sets ((v.device), ())
  union all
  select 'inp', v.device, percentile_disc(0.75) within group (order by v.inp_ms)::double precision, count(v.inp_ms)
    from v group by grouping sets ((v.device), ())
  union all
  select 'cls', v.device, percentile_disc(0.75) within group (order by v.cls)::double precision, count(v.cls)
    from v group by grouping sets ((v.device), ());
$$;

revoke all on function public.site_vitals_summary(uuid, date, date) from public, anon;
grant execute on function public.site_vitals_summary(uuid, date, date) to authenticated, service_role;

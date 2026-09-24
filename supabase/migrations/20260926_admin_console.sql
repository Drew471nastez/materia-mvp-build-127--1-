/* ===========================================================================
   STORELIB ADMIN: WHAT /admin NEEDS FROM THE DATABASE

   Paste the whole thing into the Supabase SQL editor and press Run.

   Safe to run more than once: every line checks before it acts. Nothing here
   deletes or rewrites data you already have. It adds two columns to
   creators, two small tables that only the server can read, and three
   read-only functions that add up orders inside the database.

   ONE STATEMENT PER LINE, on purpose. Let the editor wrap the long ones and
   do not reformat.

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

/* Check: every value should read true. */
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'banned_at') as creators_banned_at, to_regclass('public.admin_moderation_log') is not null as admin_moderation_log, to_regclass('public.admin_actions') is not null as admin_actions, to_regprocedure('public.admin_order_totals(timestamptz)') is not null as admin_order_totals, to_regprocedure('public.admin_creator_sales(uuid[], timestamptz, integer)') is not null as admin_creator_sales, to_regprocedure('public.admin_daily_sales(integer)') is not null as admin_daily_sales;

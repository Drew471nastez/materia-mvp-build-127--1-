-- ===========================================================================
--  DELETE CREATORS BY SIGNUP DATE
-- ===========================================================================
--  Run against a real Postgres 16 before being written down here: the schema
--  below was built from scripts/002, 003 and 004, seeded with the three cases
--  that matter, and every statement executed.
--
--  ---------------------------------------------------------------------
--   WHY THE EARLIER VERSION FAILED
--  ---------------------------------------------------------------------
--    ERROR: 42703: column "creator_id" does not exist
--    LINE 12: ... from public.orders where creator_id = c.id
--
--  public.orders has no creator_id.  It has buyer_id and product_id, and the
--  creator is reached through products:
--
--    orders.product_id -> products.id -> products.creator_id -> creators.id
--
--  (public.entitlements DOES have creator_id, which is probably where the
--  column came from.  orders never had it.)
--
--  ---------------------------------------------------------------------
--   PREFER THE ADMIN UI
--  ---------------------------------------------------------------------
--  /admin/blog/seo -> "Signed up from" -> "Delete everyone in range" does all
--  of this AND deletes their storage objects, which SQL cannot reach.  Raw SQL
--  leaves uploaded files orphaned in the bucket, still costing money and still
--  downloadable by anyone holding a signed URL.  Use this file when the range
--  is too large for the UI's 500 bound, or when the UI is not available.
-- ===========================================================================


-- ===========================================================================
--  STEP 1 — PREVIEW.  Read-only.  Run this first and read the numbers.
-- ===========================================================================
--  The date is UTC.  '2026-06-04 00:00:00+00' includes June 4 itself.
--  For "the last 30 days" instead, use:  now() - interval '30 days'
with target as (
  select c.id as creator_id, c.user_id, c.slug, u.email, u.created_at,
         exists (
           select 1
           from public.orders o
           join public.products p on p.id = o.product_id
           where p.creator_id = c.id
             and o.status in ('completed', 'refunded')
         ) as has_sales
  from public.creators c
  join auth.users u on u.id = c.user_id
  where u.created_at >= timestamptz '2026-06-04 00:00:00+00'
)
select
  count(*)                              as creators_in_range,
  count(*) filter (where not has_sales) as will_be_deleted,
  count(*) filter (where has_sales)     as protected_by_sales
from target;

-- And the rows themselves, so you can look before you act.
with target as (
  select c.slug, u.email, u.created_at,
         exists (
           select 1
           from public.orders o
           join public.products p on p.id = o.product_id
           where p.creator_id = c.id
             and o.status in ('completed', 'refunded')
         ) as has_sales
  from public.creators c
  join auth.users u on u.id = c.user_id
  where u.created_at >= timestamptz '2026-06-04 00:00:00+00'
)
select slug, email, created_at,
       case when has_sales then 'KEPT - has sales' else 'will be deleted' end as outcome
from target
order by has_sales desc, created_at;


-- ===========================================================================
--  STEP 2 — DELETE.  One transaction.  Nothing commits until all of it works.
-- ===========================================================================
begin;

create temp table doomed on commit drop as
select c.user_id
from public.creators c
join auth.users u on u.id = c.user_id
where u.created_at >= timestamptz '2026-06-04 00:00:00+00'
  -- Protects anyone who has actually sold something, because a refund needs
  -- the buyer's order to still exist.  To delete EVERY creator in the range
  -- regardless of sales, delete this whole `and not exists (...)` clause and
  -- put the `;` back on the line above.
  and not exists (
    select 1
    from public.orders o
    join public.products p on p.id = o.product_id
    where p.creator_id = c.id
      and o.status in ('completed', 'refunded')
  );

-- -------------------------------------------------------------------------
--  Clear what would otherwise block the delete.
-- -------------------------------------------------------------------------
--  Most references to auth.users cascade.  Some do not — they were declared
--    uploaded_by uuid references auth.users(id)
--  with no ON DELETE, which means NO ACTION, and a single surviving row makes
--  the entire delete fail with:
--
--    ERROR: update or delete on table "users" violates foreign key constraint
--           "upload_events_creator_id_fkey" on table "upload_events"
--
--  That is not hypothetical; it is what the naive delete does on this schema.
--  Rather than name those tables — the list is whatever YOUR database has, not
--  whatever the migrations in the repo say — this asks pg_catalog and handles
--  every one it finds.  Nullable columns are nulled, keeping the row as
--  evidence minus the person; NOT NULL ones have their rows deleted, because
--  there is no way to keep them.
do $$
declare
  fk record;
  cleared int;
begin
  for fk in
    select src.relname as table_name,
           nsp.nspname as schema_name,
           att.attname as column_name,
           att.attnotnull
    from pg_constraint con
    join pg_class src     on src.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = src.relnamespace
    join pg_class tgt     on tgt.oid = con.confrelid
    join pg_namespace tn  on tn.oid = tgt.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid
                         and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and tgt.relname = 'users'
      and tn.nspname  = 'auth'
      and con.confdeltype in ('a', 'r')   -- NO ACTION / RESTRICT: the blockers
      and array_length(con.conkey, 1) = 1
  loop
    if fk.attnotnull then
      execute format('delete from %I.%I where %I in (select user_id from doomed)',
                     fk.schema_name, fk.table_name, fk.column_name);
      get diagnostics cleared = row_count;
      raise notice 'deleted % row(s) from %.% (% is NOT NULL)',
        cleared, fk.schema_name, fk.table_name, fk.column_name;
    else
      execute format('update %I.%I set %I = null where %I in (select user_id from doomed)',
                     fk.schema_name, fk.table_name, fk.column_name, fk.column_name);
      get diagnostics cleared = row_count;
      raise notice 'cleared % row(s) in %.%.%',
        cleared, fk.schema_name, fk.table_name, fk.column_name;
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------------------
--  The delete.  Everything else follows from auth.users by cascade:
--  creators -> products -> orders and entitlements.
-- -------------------------------------------------------------------------
delete from auth.users where id in (select user_id from doomed);

--  Read the count.  If it is not what STEP 1 said, type `rollback;` instead.
commit;

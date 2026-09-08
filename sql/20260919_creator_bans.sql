-- Banning a creator, as a fact on the row rather than a deletion.
--
-- A ban and a delete are different tools and conflating them is how a mistake
-- becomes permanent: a ban is a judgement that can be reviewed, reversed, and
-- explained, and it keeps the evidence that led to it. Deletion is for when
-- there is nothing worth keeping.
alter table public.creators
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text;

-- Every read that lists creators or their products filters on this, so it is
-- the shape of the index: partial, because the banned set is the small one.
create index if not exists creators_banned_at_idx
  on public.creators (banned_at)
  where banned_at is not null;

comment on column public.creators.banned_at is
  'When an operator banned this creator. Null means active. Their products are set to unpublished at the same moment.';

-- ===========================================================================
--  WHO WAS REMOVED, AND BY WHOM
-- ===========================================================================
-- Deletion cascades into auth.users and cannot be undone, so the one thing
-- that must survive it is the record that it happened. Without this, "where
-- did that account go" has no answer at all.
create table if not exists public.admin_moderation_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('ban', 'unban', 'delete')),
  creator_id uuid,
  user_id uuid,
  username text,
  reason text,
  -- Counts at the moment of the action: what was actually destroyed.
  products_affected int default 0,
  created_at timestamptz not null default now()
);

create index if not exists admin_moderation_log_created_idx
  on public.admin_moderation_log (created_at desc);

alter table public.admin_moderation_log enable row level security;

-- No policy: the service role writes it, and nothing else may read it. An
-- audit log a user can read is an audit log that tells somebody they were
-- reported.

-- ===========================================================================
--  MAKING "unpublished" LEGAL ON PRODUCTS
-- ===========================================================================
-- scripts/003_create_products.sql declared:
--
--   status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
--
-- and nothing since has widened it. `sites` and `theme_installs` both allow
-- 'unpublished' already, so the vocabulary existed everywhere EXCEPT the one
-- table a ban has to write to.
--
-- Without this, the ban's `update products set status = 'unpublished'` is a
-- 23514 check violation. postgrest-js does not throw on that, so the ban would
-- have reported success while every product stayed published and buyable —
-- the storefront closed and the shelves still full. The route now checks the
-- error too (see `must()`), which turns that into a visible failure; this
-- makes it not fail in the first place.
--
-- 'draft' would have avoided the migration, but it conflates "an operator took
-- this down" with "the creator has not finished it yet", and unbanning could
-- never tell them apart.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_status_check'
  ) then
    alter table public.products drop constraint products_status_check;
  end if;

  alter table public.products
    add constraint products_status_check
    check (status in ('draft', 'published', 'unpublished'));
end $$;

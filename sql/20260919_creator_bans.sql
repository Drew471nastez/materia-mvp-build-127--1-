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

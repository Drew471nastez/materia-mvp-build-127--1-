-- ###########################################################################
--  SIGNUP ABUSE: A LEDGER, AND A FLAG ON THE ACCOUNTS ALREADY HERE
-- ###########################################################################
--
--  In August 2026 around three hundred and sixty accounts registered on
--  Storelib in three same-day batches. Every one published nothing. Their
--  handles were an Indonesian gambling SEO farm's brand list:
--
--      powerokebos999   okebos999autojp2026   powerdompethoki
--      powersanur999    dompethokiautojp2026  puton888asix ...
--
--  They were not selling. They were harvesting: every signup minted an
--  indexable storelib.com/u/<handle>, a canonical, ProfilePage structured data,
--  a <handle>.storelib.com subdomain, and a row in sitemap.xml. That is a
--  backlink on an authoritative domain, three hundred and sixty times, free.
--
--  The application-side fix is in lib/security/spam-signals.ts, app/sitemap.ts
--  and app/(marketing)/u/[username]/page.tsx: indexable surface is now EARNED
--  BY PUBLISHING A PRODUCT, which is the one thing a link farm will not do.
--  This file adds the two pieces of that which have to live in the database.
--
--  Run this whole file in the Supabase SQL editor. It is idempotent: every
--  statement guards itself, so re-running it changes nothing.

-- ---------------------------------------------------------------------------
-- 1. The attempt ledger
-- ---------------------------------------------------------------------------
-- Velocity is the signal a handle blocklist cannot see. One account called
-- `powerbeton888` is a guess; forty accounts from one /24 in ninety minutes is
-- a fact, and it stays true after the farm renames itself to something this
-- codebase has never heard of.
--
-- The IP is stored HASHED, never raw. It is personal data under GDPR, this is a
-- Romanian marketplace, and the rate limiter only ever needs to answer "have I
-- seen this one before" — which a hash answers exactly as well. The hash is
-- salted per deployment in app code, so the table alone cannot be reversed with
-- a rainbow table of the whole IPv4 space.
create table if not exists public.signup_attempts (
  id          bigserial primary key,
  ip_hash     text not null,
  -- The domain only, never the address. Enough to spot a throwaway-domain
  -- flood; not enough to be a mailing list if this table ever leaks.
  email_domain text,
  handle      text,
  score       integer not null default 0,
  -- 'allowed' | 'blocked' | 'review'
  verdict     text not null default 'allowed',
  reasons     text[],
  created_at  timestamptz not null default now()
);

-- The rate limiter's only query: how many from this IP since a cutoff. Without
-- this index it is a sequential scan on the hot path of every signup.
create index if not exists signup_attempts_ip_recent_idx
  on public.signup_attempts (ip_hash, created_at desc);

-- For the admin review queue, which reads by time and by verdict.
create index if not exists signup_attempts_created_idx
  on public.signup_attempts (created_at desc);

-- Nobody but the service role. There is no user-facing read of this table and
-- there must never be one: it would tell an attacker exactly how close to the
-- limit they are. RLS on with zero policies denies everyone; the service role
-- bypasses RLS by design, which is the only access this needs.
alter table public.signup_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Retention
-- ---------------------------------------------------------------------------
-- The ledger answers a question about the last hour. Keeping it for a year
-- would be storing hashed personal data long after it stops being useful, which
-- is the opposite of what data minimisation asks for. Thirty days is generous
-- for the slow, patient farms that spread a batch over weeks.
--
-- Called by the signup guard on a small fraction of requests rather than by a
-- cron, so there is nothing to schedule and nothing to forget.
create or replace function public.prune_signup_attempts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.signup_attempts where created_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- 3. Marking the accounts that are already here
-- ---------------------------------------------------------------------------
-- Two columns rather than a delete. Deleting three hundred and sixty rows is
-- irreversible, it cascades into auth.users, and the batch is certain to
-- contain at least one real person who happened to pick an unlucky handle.
-- Flagging is reversible, it is reviewable, and the containment fix has already
-- taken away everything the farm came for whether or not anybody ever gets
-- round to reviewing them.
--
--   spam_score  — what lib/security/spam-signals.ts scored the handle.
--   spam_state  — an operator's decision, and it OVERRIDES the score:
--                 'clear'     the score was wrong, treat as a normal account
--                 'suspect'   flagged, awaiting a human
--                 'confirmed' confirmed spam; no indexable surface, ever
--                 null        never assessed
alter table public.profiles add column if not exists spam_score integer;
alter table public.profiles add column if not exists spam_state text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_spam_state_check'
  ) then
    alter table public.profiles
      add constraint profiles_spam_state_check
      check (spam_state is null or spam_state in ('clear', 'suspect', 'confirmed'));
  end if;
end $$;

-- Partial: the overwhelming majority of rows are null and never queried by it.
create index if not exists profiles_spam_state_idx
  on public.profiles (spam_state) where spam_state is not null;

-- ---------------------------------------------------------------------------
-- 4. What the storefront reads
-- ---------------------------------------------------------------------------
-- Publication is the primary gate and it lives in app code, because it has to
-- be recomputed per request as sellers publish. This view is the operator's
-- ANSWER SHEET rather than a dependency: which accounts have surface, which do
-- not, and why. Handy in the SQL editor when somebody asks "is my store
-- indexed" and the answer needs to be checkable in one query.
create or replace view public.storefront_indexability as
select
  p.id,
  p.username,
  p.created_at,
  p.spam_score,
  p.spam_state,
  coalesce(pub.published_count, 0) as published_products,
  (
    coalesce(pub.published_count, 0) > 0
    and coalesce(p.spam_state, '') <> 'confirmed'
  ) as indexable
from public.profiles p
left join lateral (
  select count(*) as published_count
  from public.products pr
  join public.creators c on c.id = pr.creator_id
  where c.user_id = p.id and pr.status = 'published'
) pub on true
where p.username is not null;

comment on view public.storefront_indexability is
  'Which storefronts get sitemap and robots surface. Publication is the gate; see lib/security/spam-signals.ts deservesIndexing().';

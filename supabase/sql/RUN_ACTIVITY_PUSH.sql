-- ===========================================================================
--  Storelib — social activity notifications (likes, follows, trending)
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: running it again changes
--  nothing and raises nothing.
--
--  Run AFTER supabase/sql/RUN_MESSAGING_ALL.sql (this widens a constraint that
--  file creates) and after supabase/sql/RUN_MESSAGE_PUSH.sql (this reuses the
--  push_preview_enabled column that file adds).
--
--  Until this has run, social activity notifications are simply OFF — the code
--  logs one line saying the table is missing and every like and follow works
--  exactly as it does today. Nothing here is required for anything else.
--
--  Note the asymmetry with chat push, which degrades by SENDING. This degrades
--  by staying quiet, because the failure mode of guessing on this path is a
--  phone that buzzes for every heart — which is the whole thing the feature
--  exists to prevent. See lib/push/activity-db.ts.
-- ===========================================================================

-- ── 1. The queue ───────────────────────────────────────────────────────────
--  Social events are written here as they happen and sent as a BATCH by
--  /api/cron/activity-digest. Nothing is pushed at the moment of the like.
--
--  `dedupe_key` is the anti-abuse mechanism and the reason this table has a
--  unique constraint rather than just a primary key. It is
--
--      like:<listing>:<actor>            — one notification per person per listing, ever
--      follow:<recipient>:<actor>        — one per person per person, ever
--      trending:<listing>:<YYYY-MM-DD>   — at most one per listing per day
--
--  Note what is NOT in the first two: a timestamp. A key containing the time
--  would let somebody generate unlimited notifications by tapping a heart on
--  and off, which is the cheapest possible way to harass a seller.
--
--  `notified_at` doubles as the CLAIM. The digest runs
--  `update … set notified_at = now() where id in (…) and notified_at is null
--   returning *`, so two cron instances racing resolve in Postgres and the rows
--  are won exactly once. There is no in-memory dedupe anywhere in this feature:
--  Vercel functions do not share memory, so a module-level Set is a mechanism
--  that works on one instance and not across two.
create table if not exists public.activity_push_queue (
  id           uuid        primary key default gen_random_uuid(),
  recipient_id uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('like', 'follow', 'trending')),
  actor_id     uuid        references auth.users(id) on delete cascade,
  listing_id   uuid,
  dedupe_key   text        not null unique,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);

comment on table public.activity_push_queue is
  'Batched social activity events. dedupe_key IS the "notify once" mechanism; notified_at IS the claim. See lib/push/activity-notification.ts.';

--  The digest's only two reads: "who has something pending" and "what is
--  pending for this person". Partial, because a sent row never matters to
--  either question again.
create index if not exists activity_push_queue_pending_idx
  on public.activity_push_queue (recipient_id, created_at)
  where notified_at is null;

--  Housekeeping needs to find old rows by age regardless of state.
create index if not exists activity_push_queue_created_at_idx
  on public.activity_push_queue (created_at);

--  Nobody reads this through the API — only the service role, from the server.
--  RLS on with no policy means exactly that.
alter table public.activity_push_queue enable row level security;

-- ── 2. Preference and rate-limit columns ───────────────────────────────────
--  push_activity_enabled is a THIRD switch, separate from push_messages_enabled
--  on purpose: "stop telling me about likes" and "stop telling me about
--  messages" are different requests, and a single switch would make the person
--  who wants the first give up the second.
--
--  push_preview_enabled is deliberately SHARED with chat rather than duplicated.
--  It means one thing — "do not put names and content on my lock screen" — and
--  two switches spelling the same sentence is two switches to get out of step.
alter table public.profiles
  add column if not exists push_activity_enabled boolean not null default true;

--  The four-hour floor between digests, held in the database because serverless
--  instances cannot share a timestamp any more than they can share a Set.
alter table public.profiles
  add column if not exists activity_push_last_at timestamptz;

comment on column public.profiles.push_activity_enabled is
  'False silences likes, follows and trending. Chat, sale and payout notifications are unaffected.';
comment on column public.profiles.activity_push_last_at is
  'When the last activity digest was sent. The rate limit (MIN_GAP_MS in lib/push/activity-notification.ts) reads this.';

-- ── 3. The in-app feed learns two words ────────────────────────────────────
--  The push is a summary; the notifications tab is where the detail lives, and
--  it is where a tapped digest lands. So a like and a trending listing need to
--  be expressible as feed rows, which means widening the CHECK constraint that
--  RUN_MESSAGING_ALL.sql created.
--
--  Guarded, so this file is safe on a database where the constraint was already
--  widened or was never created under that name.
do $$
begin
  if to_regclass('public.notifications') is not null then
    if exists (select 1 from pg_constraint where conname = 'notifications_kind_check') then
      alter table public.notifications drop constraint notifications_kind_check;
    end if;
    alter table public.notifications
      add constraint notifications_kind_check
      check (kind in ('follow', 'offer_received', 'offer_accepted', 'offer_declined',
                      'message', 'like', 'trending'));
  end if;
end $$;

-- ── 4. Trending is counted, not stored ─────────────────────────────────────
--  A listing is "trending" when it collected TREND_MIN_SAVES wishlist saves in
--  the last 24 hours (lib/push/activity-db.ts). There is no counter column and
--  nothing to reset at midnight: the number is recomputed from wishlist_items
--  every run, and the once-per-day guarantee comes from the dedupe key above.
--
--  The index that makes that scan cheap.
create index if not exists wishlist_items_created_at_idx
  on public.wishlist_items (created_at desc);

-- ── 5. Housekeeping ────────────────────────────────────────────────────────
--  Rows are kept for 30 days AFTER being sent, not deleted on send — because
--  the dedupe key only prevents a repeat while the row exists, and a like that
--  can be re-notified an hour later is not deduplicated at all. Thirty days is
--  the window in which re-liking is a person, not an accident.
--
--  This is a statement to run occasionally, not a trigger. Paste it into the
--  SQL editor whenever, or attach it to pg_cron if that extension is enabled:
--
--    delete from public.activity_push_queue
--     where notified_at is not null and notified_at < now() - interval '30 days';

-- ── Tell PostgREST the schema changed ──────────────────────────────────────
--  Not optional. PostgREST validates against its own cached schema before
--  Postgres is asked anything, so the table and columns above do not exist as
--  far as the API is concerned until this runs.
notify pgrst, 'reload schema';

select 'social activity push: queue, preference columns, feed kinds and indexes are ready' as result;

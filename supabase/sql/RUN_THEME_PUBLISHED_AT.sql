-- ===========================================================================
--  Storelib — when a theme last went live
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive.
--
--  The publish panel says "Changes since published 4 minutes ago", and status
--  alone cannot say when. One nullable column; nothing reads it until it is
--  set, and the publish route falls back to writing status only until this
--  has run, so publishing never fails on a timestamp.
-- ===========================================================================

alter table public.store_theme_installs
  add column if not exists published_at timestamptz;

comment on column public.store_theme_installs.published_at is
  'When this install last went live. Set by the publish route; null until then.';

-- Themes that are already live get an honest "unknown" rather than an
-- invented time: null reads as "Published" with no clock, which is true.

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'store_theme_installs'
       and column_name = 'published_at') as column_present;

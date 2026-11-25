-- ===========================================================================
--  STORELIB: WHAT ROUNDS 59 AND 60 NEED ON PRODUCTION, IN ONE FILE
-- ===========================================================================
--  Paste all of it into the Supabase SQL editor and press Run. Safe to run
--  twice: every part checks before it creates or changes anything. It
--  deletes no data.
--
--    A. Round 21 (theme releases, seven websites, email_verified), exactly as
--       supabase/sql/RUN_ROUND_21_ALL.sql. Skip it if you already ran that file.
--    B. Part 430: creator activity for /admin (round 59). Update the privacy
--       policy before running this; recording starts as soon as it runs.
--    C. Part 446: a business limit per account (round 60). Every account
--       stays at three until a row in business_limits says otherwise.
--    D. Website backups (round 61), exactly as
--       supabase/sql/RUN_THEME_BACKUPS.sql: the store_theme_backups table
--       Publish saves a copy into. Until it runs, a publish goes live as
--       normal and keeps no backup to go back to. Skip it if you already ran
--       that file; running it again changes nothing.
--
--  To give one account unlimited businesses, run this line after the file,
--  with the email that account signs in with:
--    insert into public.business_limits (user_id, business_limit, note)
--    select id, -1, 'owner: no business limit' from auth.users
--    where email = 'YOUR_EMAIL' on conflict (user_id) do update
--    set business_limit = excluded.business_limit, updated_at = now();
-- ===========================================================================

-- ── A. Round 21 ─────────────────────────────────────────────────────────────
-- ===========================================================================
--  STORELIB: EVERYTHING ROUND 21 NEEDS ON PRODUCTION, IN ONE FILE
-- ===========================================================================
--  Paste all of it into the Supabase SQL editor and press Run. Safe to run
--  twice: every part checks before it creates or changes anything. It
--  deletes no data and changes no existing row, except one backfill noted in
--  part 3, which only happens on a database that never had the column.
--
--    1. A library keeps seven websites, enforced by the database (the limit
--       was five; lib/website-builder/theme-registry.ts THEME_INSTALL_LIMIT).
--    2. Theme releases: the theme_releases table /admin/themes publishes
--       versions into and the library's Update available reads; a
--       description and a phone cover on each marketplace listing.
--    3. profiles.email_verified and email_verified_at, which sign in, the
--       creator pages and guest order linking read. Added only if missing;
--       when added, accounts whose address Supabase Auth already confirmed
--       are marked verified so nobody is sent back to the code screen. Then
--       the guard (part 347) that only the server may set them.
--
--  The last statement answers one row of true/false: every column should be
--  true when the run is done.
-- ===========================================================================

-- ── 1. Seven websites per library ──────────────────────────────────────────
create or replace function public.store_theme_installs_library_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kept integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('store_theme_installs:' || new.creator_id::text, 0));
  select count(*) into kept from public.store_theme_installs where creator_id = new.creator_id;
  if kept >= 7 then
    raise exception 'library_full'
      using errcode = 'P0001',
            hint = 'A library keeps 7 websites. Remove one to add another.';
  end if;
  return new;
end;
$$;

do $do$ begin
  if to_regclass('public.store_theme_installs') is not null then
    drop trigger if exists store_theme_installs_library_limit on public.store_theme_installs;
    create trigger store_theme_installs_library_limit
      before insert on public.store_theme_installs
      for each row execute function public.store_theme_installs_library_limit();
  end if;
end $do$;

-- ── 2. Theme releases (supabase/sql/RUN_THEME_RELEASES.sql) ────────────────
create table if not exists public.theme_releases (
  id uuid primary key default gen_random_uuid(),
  target text not null check (target = 'base' or target ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  family text not null check (family ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  version text not null check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  notes text not null default '' check (char_length(notes) <= 4000),
  source text not null check (source in ('zip', 'code')),
  layer text not null default 'theme' check (layer in ('theme', 'overlay')),
  package_path text not null check (package_path ~ '^theme-releases/'),
  manifest jsonb not null default '{}'::jsonb,
  files integer not null default 0 check (files >= 0),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target, version)
);

create index if not exists theme_releases_family_published on public.theme_releases (family, published, created_at desc);

comment on table public.theme_releases is
  'Versions of a theme published from /admin/themes. target: base or a listing address. Read by every creator for its notes; written only by the server.';

alter table public.theme_releases enable row level security;

do $do$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theme_releases' and policyname = 'theme_releases_read_published') then
    create policy theme_releases_read_published on public.theme_releases for select to anon, authenticated using (published);
  end if;
end $do$;

revoke all on public.theme_releases from anon, authenticated;
grant select (id, target, family, version, notes, source, published, published_at, created_at) on public.theme_releases to anon, authenticated;

-- The listings table is part 252's; on a database without it this step waits for it.
do $do$ begin
  if to_regclass('public.theme_marketplace_listings') is not null then
    alter table public.theme_marketplace_listings
      add column if not exists description text check (description is null or char_length(description) <= 600),
      add column if not exists phone_cover_url text;
    comment on column public.theme_marketplace_listings.description is
      'A sentence or two shown under the name on the theme''s page at storelib.com/themes.';
    comment on column public.theme_marketplace_listings.phone_cover_url is
      'The cover at a phone''s width, shown beside the desktop cover.';
  end if;
end $do$;

-- ── 3. profiles.email_verified, and only the server sets it ───────────────
do $do$ begin
  if to_regclass('public.profiles') is null then return; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_verified') then
    alter table public.profiles add column email_verified boolean not null default false;
    -- New column: an address Supabase Auth has already confirmed counts as verified.
    update public.profiles p set email_verified = true
      from auth.users u
      where u.id = p.id and u.email_confirmed_at is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email_verified_at') then
    alter table public.profiles add column email_verified_at timestamptz;
    update public.profiles p set email_verified_at = coalesce(u.email_confirmed_at, now())
      from auth.users u
      where u.id = p.id and p.email_verified and p.email_verified_at is null;
  end if;
end $do$;

create or replace function public.profiles_keep_email_verified() returns trigger language plpgsql as $f$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.email_verified := false;
      new.email_verified_at := null;
    else
      new.email_verified := old.email_verified;
      new.email_verified_at := old.email_verified_at;
    end if;
  end if;
  return new;
end $f$;

do $do$ begin
  if to_regclass('public.profiles') is null then return; end if;
  drop trigger if exists profiles_keep_email_verified on public.profiles;
  create trigger profiles_keep_email_verified before insert or update on public.profiles
    for each row execute function public.profiles_keep_email_verified();
end $do$;

notify pgrst, 'reload schema';

-- ── Check: every column true ───────────────────────────────────────────────
select
  exists (select 1 from pg_trigger where tgname = 'store_theme_installs_library_limit' and not tgisinternal)
    and position('kept >= 7' in pg_get_functiondef('public.store_theme_installs_library_limit()'::regprocedure)) > 0 as library_limit_seven,
  to_regclass('public.theme_releases') is not null
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.theme_releases')), false) as theme_releases_with_rls,
  not has_column_privilege('anon', 'public.theme_releases', 'package_path', 'SELECT')
    and has_column_privilege('anon', 'public.theme_releases', 'notes', 'SELECT')
    and not has_table_privilege('authenticated', 'public.theme_releases', 'INSERT') as theme_releases_read_only,
  (to_regclass('public.theme_marketplace_listings') is null
    or (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'theme_marketplace_listings' and column_name in ('description', 'phone_cover_url'))) as listing_description_and_phone_cover,
  (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('email_verified', 'email_verified_at'))
    and exists (select 1 from pg_trigger where tgname = 'profiles_keep_email_verified' and not tgisinternal) as profiles_email_verified;


-- ── B. Part 430: creator activity ──────────────────────────────────────────
/* Creator activity for /admin, round 59 (lib/activity/creator-activity.ts). `creator_activity_events` keeps what a creator did in /app for 30 days: a page they opened (its path with every id replaced by :id) or a named action (site.publish, stripe.start, editor.open), the server's time, and on the first event of a session their country (two letters from Vercel's header) and coarse device (phone, tablet or desktop; system; browser; Storelib app or web). Never typed text, field values, emails or IP addresses. `creator_presence` is one row per person, kept for good: first and last seen, the page and action they were last on, their latest country and device, when their session started, and `live_since`, the first time they had a product on sale or a website published as far as the data shows (filled for everyone below from published products and published websites). `creator_activity_ingest` takes one batch from /api/activity in one call: one insert for the events and one presence write at most every 55 seconds per person. `creator_activity_purge` deletes events past 30 days in batches for the daily cleanup. Server only: row level security on with no policy and no grant to anon or authenticated; only the service role (the API and /admin) reads or writes. The indexes are the admin's exact reads: a creator's timeline, their sessions in 7 and 30 days, the actions feed, and who is online now. Safe to run again. Until it runs, /app sends its batches and the route answers 204 without writing, and /admin says activity starts recording once this part has run. */
CREATE TABLE IF NOT EXISTS public.creator_activity_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, creator_id uuid REFERENCES public.creators(id) ON DELETE CASCADE, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL CHECK (kind IN ('page', 'action')), name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120), session_start boolean NOT NULL DEFAULT false, country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'), device text CHECK (device IS NULL OR device IN ('phone', 'tablet', 'desktop')), os text CHECK (os IS NULL OR char_length(os) <= 20), browser text CHECK (browser IS NULL OR char_length(browser) <= 24), shell text CHECK (shell IS NULL OR shell IN ('web', 'ios_app', 'android_app')));
CREATE INDEX IF NOT EXISTS creator_activity_events_user_idx ON public.creator_activity_events (user_id, id DESC);
CREATE INDEX IF NOT EXISTS creator_activity_events_sessions_idx ON public.creator_activity_events (user_id, at DESC) WHERE session_start;
CREATE INDEX IF NOT EXISTS creator_activity_events_actions_idx ON public.creator_activity_events (id DESC) WHERE kind = 'action';
CREATE TABLE IF NOT EXISTS public.creator_presence (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, creator_id uuid REFERENCES public.creators(id) ON DELETE CASCADE, first_seen_at timestamptz, last_seen_at timestamptz, session_started_at timestamptz, last_path text CHECK (last_path IS NULL OR char_length(last_path) <= 120), last_action text CHECK (last_action IS NULL OR char_length(last_action) <= 120), last_action_at timestamptz, country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'), device text CHECK (device IS NULL OR device IN ('phone', 'tablet', 'desktop')), os text CHECK (os IS NULL OR char_length(os) <= 20), browser text CHECK (browser IS NULL OR char_length(browser) <= 24), shell text CHECK (shell IS NULL OR shell IN ('web', 'ios_app', 'android_app')), live_since timestamptz);
CREATE INDEX IF NOT EXISTS creator_presence_last_seen_idx ON public.creator_presence (last_seen_at DESC) WHERE last_seen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS creator_presence_creator_idx ON public.creator_presence (creator_id);
ALTER TABLE public.creator_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_activity_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.creator_presence FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_activity_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_presence TO service_role;
CREATE OR REPLACE FUNCTION public.creator_activity_live_since(p_creator uuid) RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_product timestamptz; v_site timestamptz; BEGIN SELECT min(created_at) INTO v_product FROM public.products WHERE creator_id = p_creator AND status = 'published'; BEGIN EXECUTE 'SELECT min(published_at) FROM public.store_theme_installs WHERE creator_id = $1 AND status = ''published''' INTO v_site USING p_creator; EXCEPTION WHEN undefined_column OR undefined_table THEN v_site := NULL; END; RETURN least(v_product, v_site); END $f$;
CREATE OR REPLACE FUNCTION public.creator_activity_ingest(p_user uuid, p_events jsonb, p_country text, p_device text, p_os text, p_browser text, p_shell text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_creator uuid; v_found boolean; v_last timestamptz; v_live timestamptz; v_new boolean; v_n integer := 0; v_path text; v_action text; v_action_at timestamptz; v_wrote boolean := false; BEGIN SELECT id INTO v_creator FROM public.creators WHERE user_id = p_user ORDER BY created_at LIMIT 1; IF v_creator IS NULL THEN RETURN jsonb_build_object('events', 0, 'presence', false, 'creator', false); END IF; SELECT true, last_seen_at, live_since INTO v_found, v_last, v_live FROM public.creator_presence WHERE user_id = p_user; v_new := v_last IS NULL OR v_last < now() - interval '30 minutes'; IF jsonb_typeof(p_events) = 'array' AND jsonb_array_length(p_events) > 0 THEN INSERT INTO public.creator_activity_events (user_id, creator_id, at, kind, name, session_start, country, device, os, browser, shell) SELECT p_user, v_creator, least(coalesce((e->>'at')::timestamptz, now()), now()), e->>'kind', left(e->>'name', 120), v_new AND ord = 1, CASE WHEN v_new AND ord = 1 THEN p_country END, CASE WHEN v_new AND ord = 1 THEN p_device END, CASE WHEN v_new AND ord = 1 THEN p_os END, CASE WHEN v_new AND ord = 1 THEN p_browser END, CASE WHEN v_new AND ord = 1 THEN p_shell END FROM jsonb_array_elements(p_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'kind' IN ('page', 'action') AND coalesce(e->>'name', '') <> '' AND ord <= 40; GET DIAGNOSTICS v_n = ROW_COUNT; SELECT e->>'name' INTO v_path FROM jsonb_array_elements(p_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'kind' = 'page' ORDER BY ord DESC LIMIT 1; SELECT e->>'name', least(coalesce((e->>'at')::timestamptz, now()), now()) INTO v_action, v_action_at FROM jsonb_array_elements(p_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'kind' = 'action' ORDER BY ord DESC LIMIT 1; END IF; IF v_found IS NULL THEN INSERT INTO public.creator_presence (user_id, creator_id, first_seen_at, last_seen_at, session_started_at, last_path, last_action, last_action_at, country, device, os, browser, shell, live_since) VALUES (p_user, v_creator, now(), now(), now(), v_path, v_action, v_action_at, p_country, p_device, p_os, p_browser, p_shell, public.creator_activity_live_since(v_creator)) ON CONFLICT (user_id) DO NOTHING; v_wrote := true; ELSIF v_last IS NULL OR v_last < now() - interval '55 seconds' THEN UPDATE public.creator_presence SET creator_id = v_creator, first_seen_at = coalesce(first_seen_at, now()), last_seen_at = now(), session_started_at = CASE WHEN v_new THEN now() ELSE session_started_at END, last_path = coalesce(v_path, last_path), last_action = coalesce(v_action, last_action), last_action_at = coalesce(v_action_at, last_action_at), country = coalesce(p_country, country), device = coalesce(p_device, device), os = coalesce(p_os, os), browser = CASE WHEN p_shell IS NOT NULL THEN p_browser ELSE browser END, shell = coalesce(p_shell, shell), live_since = coalesce(live_since, public.creator_activity_live_since(v_creator)) WHERE user_id = p_user AND (last_seen_at IS NULL OR last_seen_at < now() - interval '55 seconds'); v_wrote := FOUND; END IF; RETURN jsonb_build_object('events', v_n, 'presence', v_wrote, 'creator', true, 'session_start', v_new AND v_n > 0); END $f$;
CREATE OR REPLACE FUNCTION public.creator_activity_purge(p_limit integer DEFAULT 5000) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ DECLARE v_n integer; BEGIN DELETE FROM public.creator_activity_events WHERE id IN (SELECT id FROM public.creator_activity_events WHERE at < now() - interval '30 days' ORDER BY id LIMIT greatest(1, least(coalesce(p_limit, 5000), 20000))); GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n; END $f$;
REVOKE ALL ON FUNCTION public.creator_activity_live_since(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creator_activity_ingest(uuid, jsonb, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creator_activity_purge(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creator_activity_live_since(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.creator_activity_ingest(uuid, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.creator_activity_purge(integer) TO service_role;
/* The live_since backfill, in its own block: if any creator cannot be read the tables and functions above stay, and a notice says why (r61: an owner's run must never roll back to nothing). */
DO $backfill$ BEGIN
INSERT INTO public.creator_presence (user_id, creator_id, live_since) SELECT x.user_id, x.id, x.live_since FROM (SELECT DISTINCT ON (c.user_id) c.user_id, c.id, public.creator_activity_live_since(c.id) AS live_since FROM public.creators c WHERE c.user_id IS NOT NULL ORDER BY c.user_id, c.created_at) x WHERE x.live_since IS NOT NULL ON CONFLICT (user_id) DO UPDATE SET live_since = coalesce(public.creator_presence.live_since, EXCLUDED.live_since);
EXCEPTION WHEN others THEN RAISE NOTICE 'creator activity: live_since backfill skipped (%), activity still records', SQLERRM;
END $backfill$;
notify pgrst, 'reload schema';


-- ── C. Part 446: business limit per account ────────────────────────────────
/* How many businesses one login can have, set per account by Storelib (round 60). The rule stays three a login, its first business included (part 39, lib/businesses/rules.ts MAX_BUSINESSES). A new server only table, business_limits, holds an exception for a login's first account: business_limit NULL (or no row) is the rule, -1 is no limit, 1 to 10000 is that many. Nobody can read or write it with the browser key: row level security is on with no policy, and anon and authenticated hold no privilege on it; only the service role (and the SQL editor) writes it. business_limit_of(owner) reads it, and part 39's trigger on business_links and part 376's business_handoff_accept now count to that number instead of a fixed 3, so the database agrees with the server (lib/businesses/server.ts businessLimitFor). Additive: no row changes, every login stays at three until a row says otherwise. Safe to run again, and safe before part 376 (the handoff step is skipped when its function is not there). */
create table if not exists public.business_limits (user_id uuid primary key references auth.users(id) on delete cascade, business_limit integer, note text, updated_at timestamptz not null default now(), constraint business_limits_value check (business_limit is null or business_limit = -1 or business_limit between 1 and 10000));
alter table public.business_limits enable row level security;
revoke all on public.business_limits from public, anon, authenticated;
grant all on public.business_limits to service_role;
/* The number a login can have, its first business included: the row's number, -1 for no limit, else three. Called only by the two functions below; the server reads the table itself with the service key. */
create or replace function public.business_limit_of(p_owner uuid) returns integer language sql stable security definer set search_path = public as $$ select coalesce((select l.business_limit from public.business_limits l where l.user_id = p_owner), 3) $$;
revoke all on function public.business_limit_of(uuid) from public, anon, authenticated;
grant execute on function public.business_limit_of(uuid) to service_role;
/* Part 39's count, to the login's own number. The lock per login stays, so two presses at once still take turns. */
create or replace function public.business_links_limit() returns trigger language plpgsql security definer set search_path = public as $$ declare v_max integer; begin perform pg_advisory_xact_lock(hashtextextended('business_links ' || new.owner_id::text, 0)); v_max := public.business_limit_of(new.owner_id); if v_max <> -1 and 1 + (select count(*) from public.business_links where owner_id = new.owner_id and member_id <> new.member_id) >= v_max then raise exception 'One login can have at most % businesses', v_max using errcode = 'check_violation', constraint = 'business_links_limit'; end if; return new; end; $$;
drop trigger if exists business_links_limit on public.business_links;
create trigger business_links_limit before insert or update of owner_id, member_id on public.business_links for each row execute function public.business_links_limit();
revoke all on function public.business_links_limit() from public, anon, authenticated;
/* Part 376's handoff counted the recipient's businesses to a fixed 3: the same line now asks business_limit_of. Rewritten in place from the function as it is, so nothing else in it changes, and only while it still has the fixed 3 (a second run finds nothing to do). Its grants are kept by create or replace. */
do $$ declare v_fn regprocedure := to_regprocedure('public.business_handoff_accept(uuid, text, uuid, text, text, text, text)'); v_def text; begin if v_fn is null then return; end if; v_def := pg_get_functiondef(v_fn); if position('if 1 + v_count >= 3 then' in v_def) = 0 then return; end if; execute replace(v_def, 'if 1 + v_count >= 3 then', 'if public.business_limit_of(p_recipient) <> -1 and 1 + v_count >= public.business_limit_of(p_recipient) then'); end $$;
notify pgrst, 'reload schema';

-- ── D. Website backups (supabase/sql/RUN_THEME_BACKUPS.sql) ────────────────
/* One table, store_theme_backups: the copy of a website Publish takes, and the Backups page lists and restores. Additive and safe to run again. */
create table if not exists public.store_theme_backups (
  id           uuid primary key default gen_random_uuid(),
  install_id   uuid not null references public.store_theme_installs(id) on delete cascade,
  label        text not null,
  -- Why it was taken: 'ai' after Storelib AI finished a task, 'publish' when
  -- the site went live, 'manual' from the Backups page, 'restore' for the
  -- safety copy taken just before a restore overwrote the draft.
  source       text not null default 'manual'
               check (source in ('ai', 'publish', 'manual', 'restore')),
  -- { settings: {...}, pages: [{ page_key, sections: [...] }] }
  snapshot     jsonb not null,
  -- sha256 of the snapshot, so an identical state is not stored twice in a row.
  fingerprint  text not null,
  created_at   timestamptz not null default now()
);

comment on table public.store_theme_backups is
  'Point-in-time copies of a website''s editable state. Restoring writes the copy into the draft; nothing goes live until published.';

-- Listing is always "newest first for one website"; this is that query's index.
create index if not exists store_theme_backups_install_created_idx
  on public.store_theme_backups (install_id, created_at desc);

alter table public.store_theme_backups enable row level security;

-- A creator sees the backups of websites they own, through the same chain the
-- other theme tables use: install -> creator -> auth user.
do $pol$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_select_own'
  ) then
    create policy "stb_select_own" on public.store_theme_backups
      for select using (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_insert_own'
  ) then
    create policy "stb_insert_own" on public.store_theme_backups
      for insert with check (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_theme_backups' and policyname = 'stb_delete_own'
  ) then
    create policy "stb_delete_own" on public.store_theme_backups
      for delete using (
        install_id in (
          select sti.id from public.store_theme_installs sti
          join public.creators c on c.id = sti.creator_id
          where c.user_id = auth.uid()
        )
      );
  end if;
end
$pol$;

notify pgrst, 'reload schema';

-- ── Check parts 430 and D: every column true ─────────────────────────────────────
SELECT to_regclass('public.creator_activity_events') IS NOT NULL AS events_table, to_regclass('public.creator_presence') IS NOT NULL AS presence_table, to_regprocedure('public.creator_activity_ingest(uuid, jsonb, text, text, text, text, text)') IS NOT NULL AS ingest_function, to_regprocedure('public.creator_activity_purge(integer)') IS NOT NULL AS purge_function, has_table_privilege('service_role', 'public.creator_presence', 'SELECT') AS service_role_reads, NOT has_table_privilege('anon', 'public.creator_presence', 'SELECT') AS browsers_cannot_read, to_regclass('public.store_theme_backups') IS NOT NULL AS backups_table, (SELECT count(*) = 3 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'store_theme_backups') AS backups_policies;

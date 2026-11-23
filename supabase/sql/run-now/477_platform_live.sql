/* Who is on Storelib now, across the whole platform, for /admin's Live view (round 62, lib/live/live.ts). Two tables, both server only.

`platform_live_sessions` is one row per browser tab: a random id the tab made (sixteen letters and digits, kept in its sessionStorage, never a cookie), when it started and was last seen, the area and page it is on now (ids and private segments already `:id`), its last named action, how many pages, a trail of its last 40 pages, its country (two letters), coarse device, where the visit came from (a host or a utm_source) and, only when the visitor's own consent record says yes to analytics and the browser sends neither Global Privacy Control nor Do Not Track, the signed in account. Never typed text, field values, emails, payment details or IP addresses.

`platform_live_events` is the named actions (viewed a product, added to cart, started checkout, paid, signed up, signed in, joined a community, opened a course), each with its session, area, page, country, and for a purchase the order it was checked against on the server.

`platform_live_ingest` takes one batch from /api/live in one call: the actions in one insert, and the session row written when the batch carries something new or the row is more than 55 seconds old (a heartbeat inside that window changes nothing). `platform_live_overview` is the admin's line in one read: online now by area, signed in or not, top countries, sessions today. `platform_live_purge` deletes actions and signed in or consenting sessions after 30 days and anonymous sessions after 7, in batches, for the daily cleanup.

Row level security on with no policy, and no grant to anon or authenticated: only the service role (the API and /admin) reads or writes. The indexes are the admin's exact reads: who was seen in the last two minutes (by last seen), sessions today (by start), one session's actions (by session and id), the feed by area or by action (by area or name and id), and a signed in person's sessions (by account). Safe to run again; changes nothing that exists. */
CREATE TABLE IF NOT EXISTS public.platform_live_sessions (
  sid text PRIMARY KEY CHECK (sid ~ '^[a-z0-9]{16}$'),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  area text NOT NULL CHECK (area IN ('marketing', 'themes', 'explore', 'creators', 'checkout', 'buyer', 'community', 'auth', 'app')),
  path text CHECK (path IS NULL OR char_length(path) <= 200),
  host text CHECK (host IS NULL OR host ~ '^[a-z0-9][a-z0-9.-]{0,99}$'),
  last_action text CHECK (last_action IS NULL OR char_length(last_action) <= 40),
  last_action_at timestamptz,
  pages integer NOT NULL DEFAULT 0 CHECK (pages >= 0),
  trail jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(trail) = 'array'),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  consented boolean NOT NULL DEFAULT false,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  device text CHECK (device IS NULL OR device IN ('phone', 'tablet', 'desktop')),
  os text CHECK (os IS NULL OR char_length(os) <= 20),
  browser text CHECK (browser IS NULL OR char_length(browser) <= 24),
  shell text CHECK (shell IS NULL OR shell IN ('web', 'ios_app', 'android_app')),
  source text CHECK (source IS NULL OR char_length(source) <= 60)
);
CREATE INDEX IF NOT EXISTS platform_live_sessions_seen_idx ON public.platform_live_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS platform_live_sessions_started_idx ON public.platform_live_sessions (started_at);
CREATE INDEX IF NOT EXISTS platform_live_sessions_user_idx ON public.platform_live_sessions (user_id, last_seen_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_live_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  sid text NOT NULL CHECK (sid ~ '^[a-z0-9]{16}$'),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('marketing', 'themes', 'explore', 'creators', 'checkout', 'buyer', 'community', 'auth', 'app')),
  name text NOT NULL CHECK (name ~ '^[a-z]{2,20}\.[a-z_]{2,20}$'),
  path text CHECK (path IS NULL OR char_length(path) <= 200),
  host text CHECK (host IS NULL OR host ~ '^[a-z0-9][a-z0-9.-]{0,99}$'),
  order_id uuid,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);
CREATE INDEX IF NOT EXISTS platform_live_events_sid_idx ON public.platform_live_events (sid, id DESC);
CREATE INDEX IF NOT EXISTS platform_live_events_area_idx ON public.platform_live_events (area, id DESC);
CREATE INDEX IF NOT EXISTS platform_live_events_name_idx ON public.platform_live_events (name, id DESC);

ALTER TABLE public.platform_live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_live_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_live_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_live_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_live_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_live_events TO service_role;

/* One batch: p_events is [{"k":"p","a":area,"p":path,"at":ts} | {"k":"a","a":area,"p":path,"n":name,"at":ts,"o":order_id}], at most 30, already checked by lib/live/live-server. */
CREATE OR REPLACE FUNCTION public.platform_live_ingest(p_sid text, p_events jsonb, p_user uuid, p_consented boolean, p_host text, p_country text, p_device text, p_os text, p_browser text, p_shell text, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_last timestamptz; v_found boolean; v_had_user uuid;
  v_events jsonb := CASE WHEN jsonb_typeof(p_events) = 'array' THEN p_events ELSE '[]'::jsonb END;
  v_pages jsonb; v_n_pages integer; v_area text; v_path text; v_action text; v_action_at timestamptz; v_n integer := 0; v_wrote boolean := false;
BEGIN
  IF p_sid IS NULL OR p_sid !~ '^[a-z0-9]{16}$' THEN RETURN jsonb_build_object('events', 0, 'session', false); END IF;
  SELECT true, last_seen_at, user_id INTO v_found, v_last, v_had_user FROM public.platform_live_sessions WHERE sid = p_sid;

  SELECT coalesce(jsonb_agg(jsonb_build_array(extract(epoch FROM least(coalesce((e->>'at')::timestamptz, now()), now()))::bigint, e->>'a', left(e->>'p', 200)) ORDER BY ord), '[]'::jsonb), count(*)
    INTO v_pages, v_n_pages
    FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'k' = 'p' AND ord <= 30;
  SELECT e->>'a', left(e->>'p', 200) INTO v_area, v_path FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'k' = 'p' AND ord <= 30 ORDER BY ord DESC LIMIT 1;
  SELECT e->>'n', least(coalesce((e->>'at')::timestamptz, now()), now()) INTO v_action, v_action_at FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(e, ord) WHERE e->>'k' = 'a' AND ord <= 30 ORDER BY ord DESC LIMIT 1;

  INSERT INTO public.platform_live_events (at, sid, user_id, area, name, path, host, order_id, country)
  SELECT least(coalesce((e->>'at')::timestamptz, now()), now()), p_sid, p_user, e->>'a', e->>'n', left(e->>'p', 200), p_host,
         CASE WHEN coalesce(e->>'o', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (e->>'o')::uuid END, p_country
    FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(e, ord)
   WHERE e->>'k' = 'a' AND ord <= 30
     AND e->>'a' IN ('marketing', 'themes', 'explore', 'creators', 'checkout', 'buyer', 'community', 'auth', 'app')
     AND coalesce(e->>'n', '') ~ '^[a-z]{2,20}\.[a-z_]{2,20}$';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_found IS NULL THEN
    IF v_area IS NULL THEN RETURN jsonb_build_object('events', v_n, 'session', false); END IF;
    INSERT INTO public.platform_live_sessions (sid, started_at, last_seen_at, area, path, host, last_action, last_action_at, pages, trail, user_id, consented, country, device, os, browser, shell, source)
    VALUES (p_sid, now(), now(), v_area, v_path, p_host, v_action, v_action_at, v_n_pages, v_pages, p_user, coalesce(p_consented, false), p_country, p_device, p_os, p_browser, p_shell, p_source)
    ON CONFLICT (sid) DO NOTHING;
    v_wrote := FOUND;
  ELSIF v_n_pages > 0 OR v_n > 0 OR v_last < now() - interval '55 seconds' OR v_had_user IS DISTINCT FROM p_user THEN
    UPDATE public.platform_live_sessions SET
      last_seen_at = now(),
      area = coalesce(v_area, area),
      path = coalesce(v_path, path),
      host = coalesce(p_host, host),
      last_action = coalesce(v_action, last_action),
      last_action_at = coalesce(v_action_at, last_action_at),
      pages = pages + v_n_pages,
      trail = CASE WHEN v_n_pages = 0 THEN trail ELSE (SELECT coalesce(jsonb_agg(x ORDER BY ord), '[]'::jsonb) FROM (SELECT x, ord FROM jsonb_array_elements(trail || v_pages) WITH ORDINALITY AS s(x, ord) ORDER BY ord DESC LIMIT 40) k) END,
      user_id = p_user,
      consented = coalesce(p_consented, false),
      country = coalesce(p_country, country),
      device = coalesce(p_device, device),
      os = coalesce(p_os, os),
      browser = coalesce(p_browser, browser),
      shell = coalesce(p_shell, shell),
      source = coalesce(source, p_source)
    WHERE sid = p_sid;
    v_wrote := FOUND;
    /* A yes to analytics taken back: what this session did is no longer tied to the account. */
    IF v_had_user IS NOT NULL AND p_user IS NULL THEN
      UPDATE public.platform_live_events SET user_id = NULL WHERE sid = p_sid AND user_id IS NOT NULL;
    END IF;
  END IF;
  RETURN jsonb_build_object('events', v_n, 'session', v_wrote);
END $f$;

/* The admin's line: one read every 30 seconds while /admin's Live view is on screen. */
CREATE OR REPLACE FUNCTION public.platform_live_overview(p_since timestamptz, p_today timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
  WITH online AS (
    SELECT area, user_id IS NOT NULL AS signed_in, country FROM public.platform_live_sessions WHERE last_seen_at >= p_since
  ), today AS (
    SELECT user_id, country FROM public.platform_live_sessions WHERE started_at >= p_today
  )
  SELECT jsonb_build_object(
    'online', (SELECT count(*) FROM online),
    'signed_in', (SELECT count(*) FROM online WHERE signed_in),
    'areas', (SELECT coalesce(jsonb_object_agg(area, n), '{}'::jsonb) FROM (SELECT area, count(*) AS n FROM online GROUP BY area) a),
    'countries_now', (SELECT coalesce(jsonb_agg(jsonb_build_array(country, n) ORDER BY n DESC, country), '[]'::jsonb) FROM (SELECT country, count(*) AS n FROM online WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC, country LIMIT 8) c),
    'today', (SELECT count(*) FROM today),
    'today_signed_in', (SELECT count(DISTINCT user_id) FROM today WHERE user_id IS NOT NULL),
    'countries_today', (SELECT coalesce(jsonb_agg(jsonb_build_array(country, n) ORDER BY n DESC, country), '[]'::jsonb) FROM (SELECT country, count(*) AS n FROM today WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC, country LIMIT 8) c)
  )
$f$;

CREATE OR REPLACE FUNCTION public.platform_live_purge(p_limit integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 20000)); v_events integer; v_sessions integer;
BEGIN
  DELETE FROM public.platform_live_events WHERE id IN (SELECT id FROM public.platform_live_events WHERE at < now() - interval '30 days' ORDER BY id LIMIT v_limit);
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM public.platform_live_sessions WHERE sid IN (
    SELECT sid FROM public.platform_live_sessions
     WHERE last_seen_at < now() - interval '7 days'
       AND (last_seen_at < now() - interval '30 days' OR (user_id IS NULL AND NOT consented))
     ORDER BY last_seen_at LIMIT v_limit);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  RETURN greatest(v_events, v_sessions);
END $f$;

REVOKE ALL ON FUNCTION public.platform_live_ingest(text, jsonb, uuid, boolean, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_live_overview(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_live_purge(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_live_ingest(text, jsonb, uuid, boolean, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_live_overview(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_live_purge(integer) TO service_role;

notify pgrst, 'reload schema';

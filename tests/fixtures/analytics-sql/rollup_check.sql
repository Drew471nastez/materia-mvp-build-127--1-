-- The rollup against the raw rows it is made from: four thousand events over three days,
-- three creators' properties, sessions that cross midnight, visitors with and without a session.
ALTER TABLE public.analytics_events ALTER COLUMN session_id DROP NOT NULL;
SELECT setseed(0.42);
INSERT INTO public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, property_id, path, source_category, referrer_domain, utm_campaign, device_type, country_code, link_url, created_at)
SELECT
  CASE WHEN p < 3 THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid ELSE 'bbbbbbbb-0000-0000-0000-000000000002'::uuid END,
  CASE WHEN p < 2 AND et = 'view' AND r2 < 0.3 THEN 'aaaaaaaa-1111-0000-0000-000000000001'::uuid END,
  et,
  CASE WHEN r3 < 0.9 THEN 'sess' || (g / 4)::text END,
  CASE WHEN r3 < 0.97 THEN 'vis' || (g / 9)::text END,
  (ARRAY['creator_page', 'website', 'onepage', 'website'])[p + 1],
  (ARRAY[NULL, 'aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'bbbbbbbb-5555-0000-0000-000000000001'])[p + 1]::uuid,
  (ARRAY['/', '/about', '/products/ebook', '/contact', '/ana', '/links'])[1 + (g % 6)],
  (ARRAY['direct', 'social_instagram', 'organic_search', NULL])[1 + (g % 4)],
  (ARRAY['instagram.com', 'www.google.com', NULL, 'Direct'])[1 + (g % 4)],
  CASE WHEN g % 7 = 0 THEN 'spring' END,
  (ARRAY['mobile', 'desktop', 'tablet', NULL])[1 + (g % 4)],
  (ARRAY['RO', 'US', NULL])[1 + (g % 3)],
  CASE WHEN et = 'link_click' THEN 'https://instagram.com/ana' END,
  timestamptz '2026-09-23 00:00+00' + (g * interval '64 seconds') + (r1 * interval '50 seconds')
FROM (
  SELECT g, random() AS r1, random() AS r2, random() AS r3, (g / 4) % 4 AS p,
    CASE WHEN random() < 0.8 THEN 'view' WHEN random() < 0.4 THEN 'link_click' WHEN random() < 0.5 THEN 'buy_click' ELSE 'checkout_start' END AS et
  FROM generate_series(1, 4000) g
) s;

SELECT public.analytics_refresh_property_day('2026-09-24') AS rows_24, public.analytics_refresh_property_day('2026-09-25') AS rows_25;

CREATE TEMP TABLE first_run AS SELECT creator_id, property_type, property_id, day, visitors, sessions, bounces, page_views, product_views, link_clicks, buy_clicks, checkout_starts, sources, referrers, campaigns, devices, countries, paths, landing_paths FROM public.analytics_property_daily;

-- A second run of the same days changes nothing.
SELECT public.analytics_refresh_property_day('2026-09-24') AS again_24, public.analytics_refresh_property_day('2026-09-25') AS again_25;
-- And a run for one creator only replaces that creator's rows with the same rows.
SELECT public.analytics_refresh_property_day('2026-09-24', 'aaaaaaaa-0000-0000-0000-000000000001') AS creator_only;

DO $$
DECLARE diff bigint; bad text; d date; rolled date[];
BEGIN
  SELECT count(*) INTO diff FROM (
    (SELECT * FROM first_run EXCEPT SELECT creator_id, property_type, property_id, day, visitors, sessions, bounces, page_views, product_views, link_clicks, buy_clicks, checkout_starts, sources, referrers, campaigns, devices, countries, paths, landing_paths FROM public.analytics_property_daily)
    UNION ALL
    (SELECT creator_id, property_type, property_id, day, visitors, sessions, bounces, page_views, product_views, link_clicks, buy_clicks, checkout_starts, sources, referrers, campaigns, devices, countries, paths, landing_paths FROM public.analytics_property_daily EXCEPT SELECT * FROM first_run)
  ) x;
  IF diff <> 0 THEN RAISE EXCEPTION 'ROLLUP CHECK FAILED: re-running changed % rows', diff; END IF;
  RAISE NOTICE 'ok: re-running the same days changed nothing (% rows)', (SELECT count(*) FROM first_run);

  SELECT array_agg(day ORDER BY day) INTO rolled FROM public.analytics_rollup_days;
  IF rolled IS DISTINCT FROM ARRAY['2026-09-24'::date, '2026-09-25'::date] THEN RAISE EXCEPTION 'ROLLUP CHECK FAILED: rolled days %', rolled; END IF;
  RAISE NOTICE 'ok: analytics_rollup_days holds %', rolled;

  FOREACH d IN ARRAY ARRAY['2026-09-24'::date, '2026-09-25'::date] LOOP
    -- Counted straight from the raw rows, a different way: GROUP BY rather than the function's CTEs.
    WITH raw AS (
      SELECT e.creator_id, e.property_type, e.property_id, e.event_type, e.product_id, e.created_at, e.id,
        coalesce(nullif(e.visitor_id, ''), nullif(e.session_id, ''), 'e:' || e.id::text) AS vkey,
        CASE WHEN coalesce(e.session_id, '') <> '' THEN 's:' || e.session_id WHEN coalesce(e.visitor_id, '') <> '' THEN 'v:' || e.visitor_id || ':' || (e.created_at AT TIME ZONE 'UTC')::date::text ELSE 'e:' || e.id::text END AS skey
      FROM public.analytics_events e WHERE e.property_type IS NOT NULL
    ),
    day_raw AS (SELECT * FROM raw WHERE created_at >= d::timestamp AT TIME ZONE 'UTC' AND created_at < (d + 1)::timestamp AT TIME ZONE 'UTC'),
    session_first AS (
      SELECT creator_id, property_type, property_id, skey, min(created_at) AS first_at, count(*) AS pages
      FROM raw WHERE event_type = 'view' AND created_at >= (d - 1)::timestamp AT TIME ZONE 'UTC' AND created_at < (d + 1)::timestamp AT TIME ZONE 'UTC'
      GROUP BY 1, 2, 3, 4
    ),
    expected AS (
      SELECT k.creator_id, k.property_type, k.property_id,
        (SELECT count(*) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'view') AS page_views,
        (SELECT count(*) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'view' AND r.product_id IS NOT NULL) AS product_views,
        (SELECT count(DISTINCT vkey) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'view') AS visitors,
        (SELECT count(*) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'link_click') AS link_clicks,
        (SELECT count(DISTINCT skey) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'buy_click') AS buy_clicks,
        (SELECT count(DISTINCT skey) FROM day_raw r WHERE r.creator_id = k.creator_id AND r.property_type = k.property_type AND r.property_id IS NOT DISTINCT FROM k.property_id AND r.event_type = 'checkout_start') AS checkout_starts,
        (SELECT count(*) FROM session_first s WHERE s.creator_id = k.creator_id AND s.property_type = k.property_type AND s.property_id IS NOT DISTINCT FROM k.property_id AND s.first_at >= d::timestamp AT TIME ZONE 'UTC') AS sessions,
        (SELECT count(*) FROM session_first s WHERE s.creator_id = k.creator_id AND s.property_type = k.property_type AND s.property_id IS NOT DISTINCT FROM k.property_id AND s.first_at >= d::timestamp AT TIME ZONE 'UTC' AND s.pages = 1) AS bounces
      FROM (SELECT DISTINCT creator_id, property_type, property_id FROM day_raw) k
    )
    SELECT string_agg(format('%s/%s/%s: expected %s got %s', x.creator_id, x.property_type, x.property_id, row(x.page_views, x.product_views, x.visitors, x.link_clicks, x.buy_clicks, x.checkout_starts, x.sessions, x.bounces), row(r.page_views, r.product_views, r.visitors, r.link_clicks, r.buy_clicks, r.checkout_starts, r.sessions, r.bounces)), '; ')
    INTO bad
    FROM expected x FULL JOIN (SELECT * FROM public.analytics_property_daily WHERE day = d) r
      ON r.creator_id = x.creator_id AND r.property_type = x.property_type AND r.property_id IS NOT DISTINCT FROM x.property_id
    WHERE row(x.page_views, x.product_views, x.visitors, x.link_clicks, x.buy_clicks, x.checkout_starts, x.sessions, x.bounces)
      IS DISTINCT FROM row(r.page_views::bigint, r.product_views::bigint, r.visitors::bigint, r.link_clicks::bigint, r.buy_clicks::bigint, r.checkout_starts::bigint, r.sessions::bigint, r.bounces::bigint);
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'ROLLUP CHECK FAILED on %: %', d, bad; END IF;

    -- Every breakdown adds up to what it breaks down.
    SELECT string_agg(format('%s/%s', property_type, property_id), ', ') INTO bad FROM public.analytics_property_daily p WHERE p.day = d AND (
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.sources) t(k, v)) <> p.sessions OR
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.devices) t(k, v)) <> p.sessions OR
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.countries) t(k, v)) <> p.sessions OR
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.referrers) t(k, v)) <> p.sessions OR
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.landing_paths) t(k, v)) <> p.sessions OR
      (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(p.paths) t(k, v)) <> p.page_views);
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'ROLLUP CHECK FAILED on %: a breakdown does not add up for %', d, bad; END IF;
    RAISE NOTICE 'ok: % rolled up equals the raw rows (% properties, % page views, % sessions)', d,
      (SELECT count(*) FROM public.analytics_property_daily WHERE day = d), (SELECT sum(page_views) FROM public.analytics_property_daily WHERE day = d), (SELECT sum(sessions) FROM public.analytics_property_daily WHERE day = d);
  END LOOP;
END $$;

-- OnePage page views are left out of the Storelib counts, and nothing else is.
DO $$
DECLARE all_views bigint; tallied bigint; onepage bigint;
BEGIN
  SELECT count(*) INTO all_views FROM public.analytics_events WHERE creator_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND event_type = 'view';
  SELECT count(*) INTO onepage FROM public.analytics_events WHERE creator_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND event_type = 'view' AND property_type = 'onepage';
  SELECT (public.analytics_all_time('aaaaaaaa-0000-0000-0000-000000000001', NULL) ->> 'views')::bigint INTO tallied;
  IF onepage = 0 OR tallied <> all_views - onepage THEN RAISE EXCEPTION 'ONEPAGE CHECK FAILED: % views, % OnePage, all time says %', all_views, onepage, tallied; END IF;
  SELECT (public.analytics_visit_tally('aaaaaaaa-0000-0000-0000-000000000001', NULL, 'UTC',
    (extract(epoch FROM timestamptz '2026-09-20 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-27 00:00+00') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-13 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-20 00:00+00') * 1000)::bigint, NULL, NULL, false) -> 'cur' ->> 'views')::bigint INTO tallied;
  IF tallied <> all_views - onepage THEN RAISE EXCEPTION 'ONEPAGE CHECK FAILED: visit tally says % views, expected %', tallied, all_views - onepage; END IF;
  RAISE NOTICE 'ok: the Storelib counts leave out the % OnePage views and keep the other % (all time and the visit tally agree)', onepage, all_views - onepage;
END $$;

-- ===========================================================================
--  ANALYTICS THAT LOAD QUICKLY
-- ===========================================================================
-- The Analytics page (app/api/analytics/reports) read every view row of the
-- period and the one before, 1,000 at a time with LIMIT/OFFSET, into Node,
-- and counted there. A busy store's month was hundreds of pages, each asked
-- for in turn, and each page's OFFSET made Postgres walk every row before it
-- again. These are the three things that make it quick:
--
--   1. INDEXES in the order the reads ask: a creator's (or a product's) rows
--      of one kind, by time, then id. A page of rows is then a short walk
--      from where the last one ended, with nothing to sort.
--
--   2. analytics_visit_tally: the counting, done where the rows are. It is
--      lib/analytics/reports.ts tallyVisits in SQL, by the same rules (a
--      visit is its session id, else its visitor's day on the viewer's
--      clock, else the one view; a visit is described by its first page;
--      a step counts once per visit), and it answers in the shape
--      talliesFromWire reads. The buckets are handed in, worked out by the
--      same code that labels the chart, so the database keeps no calendar of
--      its own. Only counts leave the database, never rows.
--
--   3. analytics_all_time: the "all time" line under each figure, counted
--      here instead of reading every order the creator ever had.
--
-- The app works without any of this: when the functions are missing it
-- reads the rows and counts in Node as before (the route falls back).
--
-- Both functions take a creator id, so they are the server's alone: the
-- public and signed-in roles cannot run them.

CREATE INDEX IF NOT EXISTS idx_analytics_events_creator_type_time_id ON public.analytics_events (creator_id, event_type, created_at, id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_product_type_time_id ON public.analytics_events (product_id, event_type, created_at, id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_product_time_id ON public.orders (product_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_views_page_time_id ON public.onepage_views (onepage_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_clicks_page_time_id ON public.onepage_clicks (onepage_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_onepage_leads_page_time_id ON public.onepage_leads (onepage_id, created_at, id);

CREATE OR REPLACE FUNCTION public.analytics_visit_tally(
  p_creator_id uuid,
  p_product_id uuid,
  p_time_zone text,
  p_cur_start bigint,
  p_cur_end bigint,
  p_prev_start bigint,
  p_prev_end bigint,
  p_cur_starts bigint[],
  p_prev_starts bigint[],
  p_detail boolean DEFAULT true
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
WITH
  bounds AS (
    SELECT
      timestamptz 'epoch' + p_cur_start * interval '1 millisecond' AS cs,
      timestamptz 'epoch' + p_cur_end * interval '1 millisecond' AS ce,
      timestamptz 'epoch' + p_prev_start * interval '1 millisecond' AS ps,
      timestamptz 'epoch' + p_prev_end * interval '1 millisecond' AS pe,
      coalesce(cardinality(p_cur_starts), 0) AS n
  ),
  -- The two windows, and where each bucket of the chart starts, as instants.
  -- A row's time in whole milliseconds is at or after an instant made from
  -- whole milliseconds exactly when the row itself is, so comparing the
  -- timestamps is comparing what Date.parse reads.
  win AS (
    SELECT 'cur'::text AS w, b.cs AS ws, b.ce AS we,
      ARRAY(SELECT timestamptz 'epoch' + x * interval '1 millisecond' FROM unnest(coalesce(p_cur_starts, '{}'::bigint[])) WITH ORDINALITY u(x, i) ORDER BY i) AS starts
    FROM bounds b
    UNION ALL
    SELECT 'prev'::text, b.ps, b.pe,
      ARRAY(SELECT timestamptz 'epoch' + x * interval '1 millisecond' FROM unnest(coalesce(p_prev_starts, '{}'::bigint[])) WITH ORDINALITY u(x, i) ORDER BY i)
    FROM bounds b
  ),
  -- Every view in either window, each read once: the period, then what of
  -- the comparison lies outside it (the two may overlap, or be a year apart).
  raw AS (
    SELECT e.id, e.created_at, e.session_id::text AS session_id, e.visitor_id::text AS visitor_id,
      e.source_category, e.referrer_domain, e.utm_campaign, e.country_code, e.country_name, e.city,
      e.device_type, e.browser, e.os, e.page_url
    FROM public.analytics_events e, bounds b
    WHERE e.creator_id = p_creator_id AND e.event_type = 'view'
      AND (p_product_id IS NULL OR e.product_id = p_product_id)
      AND e.created_at >= b.cs AND e.created_at < b.ce
    UNION ALL
    SELECT e.id, e.created_at, e.session_id::text, e.visitor_id::text,
      e.source_category, e.referrer_domain, e.utm_campaign, e.country_code, e.country_name, e.city,
      e.device_type, e.browser, e.os, e.page_url
    FROM public.analytics_events e, bounds b
    WHERE e.creator_id = p_creator_id AND e.event_type = 'view'
      AND (p_product_id IS NULL OR e.product_id = p_product_id)
      AND e.created_at >= b.ps AND e.created_at < b.pe
      AND NOT (e.created_at >= b.cs AND e.created_at < b.ce)
  ),
  -- The visit each view belongs to (lib/analytics/reports.ts sessionKey).
  -- The day of a visit without a session is startOfDay (lib/orders/
  -- order-view): the instant less the wall clock's time since midnight in
  -- the viewer's zone, here in whole seconds, which names the same day.
  wrows AS (
    SELECT w.w, r.id, r.created_at,
      CASE WHEN cardinality(w.starts) > 0 THEN width_bucket(r.created_at, w.starts) - 1 END AS bucket,
      (CASE
        WHEN coalesce(r.session_id, '') <> '' THEN 's:' || r.session_id
        WHEN coalesce(r.visitor_id, '') <> '' THEN 'v:' || r.visitor_id || ':' || (
          floor(extract(epoch FROM r.created_at))::bigint
          - floor(extract(epoch FROM (r.created_at AT TIME ZONE p_time_zone)::time))::bigint
        )::text
        ELSE 'e:' || r.id::text
      END) COLLATE "C" AS skey
    FROM raw r JOIN win w ON r.created_at >= w.ws AND r.created_at < w.we
  ),
  -- Each visit once, at its first page (earliest, then lowest id).
  firsts AS (
    SELECT DISTINCT ON (w, skey) w, skey, created_at, id, bucket
    FROM wrows
    ORDER BY w, skey, created_at, id
  ),
  -- Each visit described by its first page, and its place in the order the
  -- visits began, which is the order the breakdowns meet them in. Only for
  -- the whole answer: the quick one is the figures, without the lists.
  ranked AS (
    SELECT f.w, row_number() OVER (PARTITION BY f.w ORDER BY f.created_at, f.id) AS rank,
      r.source_category, r.referrer_domain, r.utm_campaign, r.country_code, r.country_name, r.city,
      r.device_type, r.browser, r.os,
      -- Landing page and channel read only the address's host and path.
      split_part(split_part(r.page_url, '#', 1), '?', 1) AS page_url
    FROM firsts f JOIN raw r ON r.id = f.id
    WHERE p_detail
  ),
  view_b AS (SELECT w, bucket, count(*) AS c FROM wrows GROUP BY w, bucket),
  session_b AS (SELECT w, bucket, count(*) AS c FROM firsts GROUP BY w, bucket),
  -- Every view and visit in the window counts in its headline; the buckets
  -- hold those that fall on the chart (a longer comparison is cut at the
  -- period's length, as bucketCounts cuts it).
  buckets AS (
    SELECT w.w,
      coalesce((SELECT sum(v.c) FROM view_b v WHERE v.w = w.w), 0) AS views,
      coalesce((SELECT sum(s.c) FROM session_b s WHERE s.w = w.w), 0) AS sessions,
      coalesce((SELECT jsonb_agg(coalesce(v.c, 0) ORDER BY g.i) FROM bounds b, generate_series(0, b.n - 1) g(i) LEFT JOIN view_b v ON v.w = w.w AND v.bucket = g.i), '[]'::jsonb) AS view_buckets,
      coalesce((SELECT jsonb_agg(coalesce(s.c, 0) ORDER BY g.i) FROM bounds b, generate_series(0, b.n - 1) g(i) LEFT JOIN session_b s ON s.w = w.w AND s.bucket = g.i), '[]'::jsonb) AS session_buckets
    FROM win w
  ),
  -- Funnel steps, each counted once per visit, keyed as the views are. A
  -- step row with neither id is keyed by its time (it is read without an id).
  steps AS (
    SELECT w.w, s.event_type, count(DISTINCT s.skey) AS c
    FROM (
      SELECT e.event_type, e.created_at,
        (CASE
          WHEN coalesce(e.session_id::text, '') <> '' THEN 's:' || e.session_id::text
          WHEN coalesce(e.visitor_id::text, '') <> '' THEN 'v:' || e.visitor_id::text || ':' || (
            floor(extract(epoch FROM e.created_at))::bigint
            - floor(extract(epoch FROM (e.created_at AT TIME ZONE p_time_zone)::time))::bigint
          )::text
          ELSE 'e:' || e.created_at::text
        END) COLLATE "C" AS skey
      FROM public.analytics_events e, bounds b
      WHERE p_detail AND e.creator_id = p_creator_id AND e.event_type IN ('buy_click', 'checkout_start')
        AND (p_product_id IS NULL OR e.product_id = p_product_id)
        AND ((e.created_at >= b.cs AND e.created_at < b.ce) OR (e.created_at >= b.ps AND e.created_at < b.pe))
    ) s
    JOIN win w ON s.created_at >= w.ws AND s.created_at < w.we
    GROUP BY w.w, s.event_type
  ),
  -- The visits in groups, one list per breakdown: the columns it reads, how
  -- many visits, and the rank of the earliest (reports.ts GROUP_COLUMNS).
  grouped AS (
    SELECT w,
      CASE
        WHEN GROUPING(source_category) = 0 THEN 'source'
        WHEN GROUPING(referrer_domain) = 0 THEN 'referrer'
        WHEN GROUPING(utm_campaign) = 0 THEN 'campaign'
        WHEN GROUPING(city) = 0 THEN 'city'
        WHEN GROUPING(country_code) = 0 THEN 'country'
        WHEN GROUPING(device_type) = 0 THEN 'device'
        WHEN GROUPING(browser) = 0 THEN 'browser'
        WHEN GROUPING(os) = 0 THEN 'os'
        ELSE 'page'
      END AS kind,
      CASE
        WHEN GROUPING(source_category) = 0 THEN jsonb_build_array(source_category)
        WHEN GROUPING(referrer_domain) = 0 THEN jsonb_build_array(referrer_domain)
        WHEN GROUPING(utm_campaign) = 0 THEN jsonb_build_array(utm_campaign)
        WHEN GROUPING(city) = 0 THEN jsonb_build_array(city, country_code, country_name)
        WHEN GROUPING(country_code) = 0 THEN jsonb_build_array(country_code, country_name)
        WHEN GROUPING(device_type) = 0 THEN jsonb_build_array(device_type)
        WHEN GROUPING(browser) = 0 THEN jsonb_build_array(browser)
        WHEN GROUPING(os) = 0 THEN jsonb_build_array(os)
        ELSE jsonb_build_array(page_url)
      END AS cols,
      count(*) AS n,
      min(rank) AS r
    FROM ranked
    GROUP BY w, GROUPING SETS ((source_category), (referrer_domain), (utm_campaign), (country_code, country_name), (city, country_code, country_name), (device_type), (browser), (os), (page_url))
  ),
  groups AS (
    SELECT w, jsonb_object_agg(kind, rows) AS groups
    FROM (SELECT w, kind, jsonb_agg(cols || jsonb_build_array(n, r) ORDER BY r) AS rows FROM grouped GROUP BY w, kind) k
    GROUP BY w
  ),
  tallies AS (
    SELECT w.w, jsonb_build_object(
      'views', bk.views,
      'view_buckets', bk.view_buckets,
      'sessions', bk.sessions,
      'session_buckets', bk.session_buckets,
      'steps', CASE WHEN p_detail THEN jsonb_build_object(
        'buy', coalesce((SELECT s.c FROM steps s WHERE s.w = w.w AND s.event_type = 'buy_click'), 0),
        'checkout', coalesce((SELECT s.c FROM steps s WHERE s.w = w.w AND s.event_type = 'checkout_start'), 0)
      ) END,
      'groups', CASE WHEN p_detail THEN coalesce((SELECT g.groups FROM groups g WHERE g.w = w.w), '{}'::jsonb) END
    ) AS t
    FROM win w JOIN buckets bk ON bk.w = w.w
  )
SELECT jsonb_object_agg(w, t) FROM tallies
$fn$;

-- All time, under each figure: every view, and every sale and its money by
-- the rules of lib/orders/order-view (one payment is one order; failed,
-- pending and disputed payments are not sales) and moneyOf (the lines'
-- amounts less what was refunded on each, never below nothing).
CREATE OR REPLACE FUNCTION public.analytics_all_time(p_creator_id uuid, p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
WITH
  lines AS (
    SELECT
      coalesce('s:' || nullif(o.stripe_session_id, ''), 'o:' || o.id::text) AS k,
      o.status,
      greatest(0, coalesce(o.amount_cents, 0))::bigint AS gross,
      CASE WHEN o.status = 'refunded' THEN
        CASE WHEN o.refund_amount_cents > 0 THEN least(o.refund_amount_cents, greatest(0, coalesce(o.amount_cents, 0))) ELSE greatest(0, coalesce(o.amount_cents, 0)) END
      ELSE 0 END::bigint AS refunded
    FROM public.orders o
    WHERE o.product_id IN (SELECT p.id FROM public.products p WHERE p.creator_id = p_creator_id)
      AND (p_product_id IS NULL OR o.product_id = p_product_id)
  ),
  payments AS (
    SELECT k,
      bool_and(coalesce(status = 'failed', false)) AS all_failed,
      bool_or(coalesce(status = 'pending', false)) AS any_pending,
      bool_or(coalesce(status = 'disputed', false)) AS any_disputed,
      greatest(0, sum(gross) - sum(refunded)) AS net
    FROM lines GROUP BY k
  )
SELECT jsonb_build_object(
  'views', (
    SELECT count(*) FROM public.analytics_events e
    WHERE e.creator_id = p_creator_id AND e.event_type = 'view' AND (p_product_id IS NULL OR e.product_id = p_product_id)
  ),
  'orders', (SELECT count(*) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed),
  'sales_cents', (SELECT coalesce(sum(net), 0) FROM payments WHERE NOT all_failed AND NOT any_pending AND NOT any_disputed)
)
$fn$;

REVOKE ALL ON FUNCTION public.analytics_visit_tally(uuid, uuid, text, bigint, bigint, bigint, bigint, bigint[], bigint[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_all_time(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_visit_tally(uuid, uuid, text, bigint, bigint, bigint, bigint, bigint[], bigint[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_all_time(uuid, uuid) TO service_role;

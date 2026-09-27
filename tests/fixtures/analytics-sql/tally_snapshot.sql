-- The reports' own counts for creator A over 2026-09-19..2026-09-22 UTC, as one text value, to compare before and after part 60.
\pset format unaligned
\pset tuples_only on
SELECT md5(public.analytics_visit_tally('aaaaaaaa-0000-0000-0000-000000000001', NULL, 'UTC',
  (extract(epoch FROM timestamptz '2026-09-19 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-22 00:00+00') * 1000)::bigint,
  (extract(epoch FROM timestamptz '2026-09-16 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-19 00:00+00') * 1000)::bigint,
  ARRAY[(extract(epoch FROM timestamptz '2026-09-19 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-20 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-21 00:00+00') * 1000)::bigint],
  ARRAY[(extract(epoch FROM timestamptz '2026-09-16 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-17 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-18 00:00+00') * 1000)::bigint],
  true)::text) AS tally_md5,
  (public.analytics_visit_tally('aaaaaaaa-0000-0000-0000-000000000001', NULL, 'UTC',
  (extract(epoch FROM timestamptz '2026-09-19 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-22 00:00+00') * 1000)::bigint,
  (extract(epoch FROM timestamptz '2026-09-16 00:00+00') * 1000)::bigint, (extract(epoch FROM timestamptz '2026-09-19 00:00+00') * 1000)::bigint,
  NULL, NULL, false) -> 'cur' ->> 'views') AS views,
  public.analytics_all_time('aaaaaaaa-0000-0000-0000-000000000001', NULL)::text AS all_time;

-- ============================================================================
-- Daily Rollup Tables — 2026-02-25
-- Pre-aggregates analytics_events and orders into daily summaries.
-- Dashboard queries read rollups instead of scanning raw event tables.
-- ============================================================================

-- ── analytics_daily_rollups ─────────────────────────────────────────────────
-- One row per creator × product × date with pre-computed view/order metrics.

CREATE TABLE IF NOT EXISTS public.analytics_daily_rollups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL,
  product_id    UUID,                             -- NULL = store-level aggregate
  rollup_date   DATE NOT NULL,
  total_views   INTEGER NOT NULL DEFAULT 0,
  unique_views  INTEGER NOT NULL DEFAULT 0,
  total_orders  INTEGER NOT NULL DEFAULT 0,
  total_revenue INTEGER NOT NULL DEFAULT 0,       -- in cents
  -- Traffic source breakdown (JSONB for flexibility)
  source_breakdown  JSONB DEFAULT '{}',           -- { "direct": 12, "organic_search": 5, ... }
  -- Device breakdown
  device_breakdown  JSONB DEFAULT '{}',           -- { "mobile": 10, "desktop": 8, "tablet": 2 }
  -- Country breakdown (top countries)
  country_breakdown JSONB DEFAULT '{}',           -- { "US": 15, "GB": 8, ... }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: one rollup per creator × product × date
  CONSTRAINT uq_rollup_creator_product_date UNIQUE (creator_id, product_id, rollup_date)
);

-- Fast lookup by creator + date range (covers all dashboard timeframe queries)
CREATE INDEX IF NOT EXISTS idx_rollups_creator_date
  ON public.analytics_daily_rollups (creator_id, rollup_date DESC);

-- Product-scoped rollup queries
CREATE INDEX IF NOT EXISTS idx_rollups_creator_product_date
  ON public.analytics_daily_rollups (creator_id, product_id, rollup_date DESC)
  WHERE product_id IS NOT NULL;

-- ── Rollup function ─────────────────────────────────────────────────────────
-- Call daily via cron: SELECT refresh_analytics_rollup(CURRENT_DATE - 1);
-- Or backfill: SELECT refresh_analytics_rollup(d) FROM generate_series('2025-01-01'::date, CURRENT_DATE, '1 day') AS d;

CREATE OR REPLACE FUNCTION public.refresh_analytics_rollup(target_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing rollups for the target date (idempotent refresh)
  DELETE FROM public.analytics_daily_rollups WHERE rollup_date = target_date;

  -- Insert fresh rollups from raw events + orders
  INSERT INTO public.analytics_daily_rollups (
    creator_id, product_id, rollup_date,
    total_views, unique_views, total_orders, total_revenue,
    source_breakdown, device_breakdown, country_breakdown
  )
  SELECT
    ae.creator_id,
    ae.product_id,
    target_date AS rollup_date,
    -- Total views (all events)
    COUNT(*)::INTEGER AS total_views,
    -- Unique views (distinct visitor/session per product)
    COUNT(DISTINCT COALESCE(ae.visitor_id, ae.session_id))::INTEGER AS unique_views,
    -- Orders + revenue from a subquery joined by creator+product+date
    COALESCE(o.order_count, 0)::INTEGER AS total_orders,
    COALESCE(o.order_revenue, 0)::INTEGER AS total_revenue,
    -- Source breakdown as JSONB
    jsonb_object_agg(
      DISTINCT COALESCE(ae.source_category, 'direct'),
      src_counts.cnt
    ) FILTER (WHERE src_counts.cnt IS NOT NULL) AS source_breakdown,
    -- Device breakdown as JSONB
    jsonb_object_agg(
      DISTINCT COALESCE(ae.device_type, 'unknown'),
      dev_counts.cnt
    ) FILTER (WHERE dev_counts.cnt IS NOT NULL) AS device_breakdown,
    -- Country breakdown as JSONB
    jsonb_object_agg(
      DISTINCT COALESCE(ae.country_code, 'unknown'),
      country_counts.cnt
    ) FILTER (WHERE country_counts.cnt IS NOT NULL) AS country_breakdown
  FROM public.analytics_events ae
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::INTEGER AS order_count,
      COALESCE(SUM(amount_cents), 0)::INTEGER AS order_revenue
    FROM public.orders
    WHERE status = 'completed'
      AND product_id = ae.product_id
      AND created_at >= target_date::TIMESTAMPTZ
      AND created_at < (target_date + 1)::TIMESTAMPTZ
  ) o ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM public.analytics_events ae2
    WHERE ae2.creator_id = ae.creator_id
      AND ae2.product_id IS NOT DISTINCT FROM ae.product_id
      AND ae2.event_type = 'view'
      AND ae2.source_category IS NOT DISTINCT FROM ae.source_category
      AND ae2.created_at >= target_date::TIMESTAMPTZ
      AND ae2.created_at < (target_date + 1)::TIMESTAMPTZ
  ) src_counts ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM public.analytics_events ae3
    WHERE ae3.creator_id = ae.creator_id
      AND ae3.product_id IS NOT DISTINCT FROM ae.product_id
      AND ae3.event_type = 'view'
      AND ae3.device_type IS NOT DISTINCT FROM ae.device_type
      AND ae3.created_at >= target_date::TIMESTAMPTZ
      AND ae3.created_at < (target_date + 1)::TIMESTAMPTZ
  ) dev_counts ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM public.analytics_events ae4
    WHERE ae4.creator_id = ae.creator_id
      AND ae4.product_id IS NOT DISTINCT FROM ae.product_id
      AND ae4.event_type = 'view'
      AND ae4.country_code IS NOT DISTINCT FROM ae.country_code
      AND ae4.created_at >= target_date::TIMESTAMPTZ
      AND ae4.created_at < (target_date + 1)::TIMESTAMPTZ
  ) country_counts ON TRUE
  WHERE ae.event_type = 'view'
    AND ae.created_at >= target_date::TIMESTAMPTZ
    AND ae.created_at < (target_date + 1)::TIMESTAMPTZ
  GROUP BY ae.creator_id, ae.product_id, o.order_count, o.order_revenue;
END;
$$;

-- ── Simpler rollup approach (recommended) ───────────────────────────────────
-- The function above is complex due to LATERAL joins. Here's a simpler
-- version that just aggregates views, then joins orders separately.

CREATE OR REPLACE FUNCTION public.refresh_daily_rollup(target_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_inserted INTEGER;
BEGIN
  -- Delete existing rollups for this date
  DELETE FROM public.analytics_daily_rollups WHERE rollup_date = target_date;

  -- Insert view aggregates
  WITH view_agg AS (
    SELECT
      creator_id,
      product_id,
      COUNT(*)::INTEGER AS total_views,
      COUNT(DISTINCT COALESCE(visitor_id, session_id))::INTEGER AS unique_views,
      jsonb_object_agg(src, src_cnt) AS source_breakdown,
      jsonb_object_agg(dev, dev_cnt) AS device_breakdown,
      jsonb_object_agg(cc, cc_cnt) AS country_breakdown
    FROM (
      SELECT
        creator_id,
        product_id,
        COALESCE(source_category, 'direct') AS src,
        COUNT(*) OVER (PARTITION BY creator_id, product_id, COALESCE(source_category, 'direct')) AS src_cnt,
        COALESCE(device_type, 'unknown') AS dev,
        COUNT(*) OVER (PARTITION BY creator_id, product_id, COALESCE(device_type, 'unknown')) AS dev_cnt,
        COALESCE(country_code, 'unknown') AS cc,
        COUNT(*) OVER (PARTITION BY creator_id, product_id, COALESCE(country_code, 'unknown')) AS cc_cnt,
        visitor_id,
        session_id
      FROM public.analytics_events
      WHERE event_type = 'view'
        AND created_at >= target_date::TIMESTAMPTZ
        AND created_at < (target_date + 1)::TIMESTAMPTZ
    ) sub
    GROUP BY creator_id, product_id
  ),
  order_agg AS (
    SELECT
      product_id,
      COUNT(*)::INTEGER AS total_orders,
      COALESCE(SUM(amount_cents), 0)::INTEGER AS total_revenue
    FROM public.orders
    WHERE status = 'completed'
      AND created_at >= target_date::TIMESTAMPTZ
      AND created_at < (target_date + 1)::TIMESTAMPTZ
    GROUP BY product_id
  )
  INSERT INTO public.analytics_daily_rollups (
    creator_id, product_id, rollup_date,
    total_views, unique_views, total_orders, total_revenue,
    source_breakdown, device_breakdown, country_breakdown
  )
  SELECT
    v.creator_id,
    v.product_id,
    target_date,
    v.total_views,
    v.unique_views,
    COALESCE(o.total_orders, 0),
    COALESCE(o.total_revenue, 0),
    v.source_breakdown,
    v.device_breakdown,
    v.country_breakdown
  FROM view_agg v
  LEFT JOIN order_agg o ON o.product_id = v.product_id;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RETURN rows_inserted;
END;
$$;

-- ── RLS Policy ──────────────────────────────────────────────────────────────
ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can view own rollups"
  ON public.analytics_daily_rollups FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM public.creators WHERE user_id = auth.uid()
    )
  );

-- ── CRON schedule (run via Supabase pg_cron or external cron) ───────────────
-- Schedule: SELECT refresh_daily_rollup(CURRENT_DATE - 1);
-- Run at 00:15 UTC daily to aggregate the previous day's data.
-- Backfill: SELECT refresh_daily_rollup(d::date) FROM generate_series('2025-01-01'::date, CURRENT_DATE - 1, '1 day') AS d;

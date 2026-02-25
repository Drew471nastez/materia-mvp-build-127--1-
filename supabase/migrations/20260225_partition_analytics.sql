-- ============================================================================
-- Table Partitioning for Analytics — 2026-02-25
-- Prepares analytics_events and onepage_views for range partitioning
-- when table sizes exceed ~5M rows.
--
-- Strategy: partition by created_at (monthly range partitions).
-- This keeps queries fast by pruning irrelevant months automatically.
--
-- NOTE: This migration creates the partitioned replacement tables and a
-- migration function. Run migrate_to_partitioned() when ready to switch.
-- ============================================================================

-- ── Helper: auto-create next month partition ─────────────────────────────
-- Call this from a monthly cron (1st of month, 00:05 UTC).

CREATE OR REPLACE FUNCTION public.create_next_analytics_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_month DATE := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
  month_after DATE := next_month + INTERVAL '1 month';
  partition_name TEXT;
BEGIN
  -- analytics_events partition
  partition_name := 'analytics_events_' || TO_CHAR(next_month, 'YYYY_MM');
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.analytics_events_partitioned
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, next_month, month_after
    );
    RAISE NOTICE 'Created partition: %', partition_name;
  END IF;

  -- onepage_views partition
  partition_name := 'onepage_views_' || TO_CHAR(next_month, 'YYYY_MM');
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = partition_name
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.onepage_views_partitioned
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, next_month, month_after
    );
    RAISE NOTICE 'Created partition: %', partition_name;
  END IF;
END;
$$;

-- ── Create partitioned table structures (not active yet) ─────────────────
-- These tables mirror the schema of their non-partitioned counterparts.
-- The actual migration swaps the tables when you're ready.

-- Check if the partitioned table already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'analytics_events_partitioned'
  ) THEN
    CREATE TABLE public.analytics_events_partitioned (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      creator_id UUID NOT NULL,
      product_id UUID,
      event_type TEXT NOT NULL DEFAULT 'view',
      visitor_id TEXT,
      session_id TEXT,
      source_category TEXT,
      device_type TEXT,
      country_code TEXT,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'onepage_views_partitioned'
  ) THEN
    CREATE TABLE public.onepage_views_partitioned (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      onepage_id UUID NOT NULL,
      visitor_id TEXT,
      session_id TEXT,
      referrer TEXT,
      user_agent TEXT,
      country_code TEXT,
      device_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);
  END IF;
END $$;

-- ── Pre-create partitions for current and next 3 months ─────────────────
DO $$
DECLARE
  m DATE;
  m_end DATE;
  pname TEXT;
BEGIN
  FOR i IN 0..3 LOOP
    m := DATE_TRUNC('month', NOW()) + (i || ' months')::INTERVAL;
    m_end := m + INTERVAL '1 month';

    -- analytics_events
    pname := 'analytics_events_' || TO_CHAR(m, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = pname) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.analytics_events_partitioned
         FOR VALUES FROM (%L) TO (%L)',
        pname, m, m_end
      );
    END IF;

    -- onepage_views
    pname := 'onepage_views_' || TO_CHAR(m, 'YYYY_MM');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = pname) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.onepage_views_partitioned
         FOR VALUES FROM (%L) TO (%L)',
        pname, m, m_end
      );
    END IF;
  END LOOP;
END $$;

-- ── Indexes on partitioned tables ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ae_part_creator_type_created
  ON public.analytics_events_partitioned (creator_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ae_part_creator_product
  ON public.analytics_events_partitioned (creator_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ov_part_onepage_created
  ON public.onepage_views_partitioned (onepage_id, created_at DESC);

-- ── Migration function ──────────────────────────────────────────────────
-- Call this when ready to switch from unpartitioned to partitioned tables.
-- It copies data, then renames tables atomically.
--
-- WARNING: This locks the table briefly. Run during low-traffic hours.

CREATE OR REPLACE FUNCTION public.migrate_to_partitioned_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Copy existing data into partitioned tables
  INSERT INTO public.analytics_events_partitioned
    SELECT * FROM public.analytics_events;

  INSERT INTO public.onepage_views_partitioned
    SELECT * FROM public.onepage_views;

  -- Rename: old → _old, partitioned → current
  ALTER TABLE public.analytics_events RENAME TO analytics_events_old;
  ALTER TABLE public.analytics_events_partitioned RENAME TO analytics_events;

  ALTER TABLE public.onepage_views RENAME TO onepage_views_old;
  ALTER TABLE public.onepage_views_partitioned RENAME TO onepage_views;

  RAISE NOTICE 'Migration complete. Old tables renamed to *_old. Verify and DROP when ready.';
END;
$$;

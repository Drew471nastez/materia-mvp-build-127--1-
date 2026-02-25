-- ============================================================================
-- Database Hygiene — 2026-02-25
-- Autovacuum tuning for high-write tables + RLS performance notes.
-- ============================================================================

-- ── Autovacuum tuning for analytics_events (high-write table) ───────────────
-- Default autovacuum thresholds are too conservative for tables with 100k+ rows.
-- This lowers the threshold so vacuuming happens more frequently, keeping
-- table bloat under control and maintaining index scan performance.

ALTER TABLE public.analytics_events SET (
  autovacuum_vacuum_threshold = 1000,          -- vacuum after 1000 dead tuples (default: 50)
  autovacuum_vacuum_scale_factor = 0.01,       -- + 1% of table size (default: 0.2 = 20%)
  autovacuum_analyze_threshold = 500,          -- analyze after 500 changes (default: 50)
  autovacuum_analyze_scale_factor = 0.005      -- + 0.5% of table size (default: 0.1 = 10%)
);

-- ── Autovacuum tuning for orders (medium-write table) ───────────────────────
ALTER TABLE public.orders SET (
  autovacuum_vacuum_threshold = 500,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 250,
  autovacuum_analyze_scale_factor = 0.01
);

-- ── Autovacuum tuning for onepage_views (high-write table) ──────────────────
ALTER TABLE public.onepage_views SET (
  autovacuum_vacuum_threshold = 1000,
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_threshold = 500,
  autovacuum_analyze_scale_factor = 0.005
);

-- ── RLS Performance: Ensure auth.uid() is used efficiently ──────────────────
-- Supabase RLS policies that call auth.uid() are efficient when there's a
-- matching index on the FK column. The following ensures key tables have
-- indexes that match their RLS policies.

-- creators.user_id is already indexed (idx_creators_user_id)
-- products.creator_id is already indexed (idx_products_creator_status_created)
-- orders.buyer_id is already indexed (idx_orders_buyer_created)

-- ── Connection pooling note ─────────────────────────────────────────────────
-- Supabase uses PgBouncer in transaction mode by default.
-- Ensure supabase-js clients use the pooled connection string (port 6543)
-- for API routes, and the direct connection (port 5432) only for migrations.
--
-- Recommended supabase client config:
--   db: { schema: 'public' }
--   auth: { persistSession: false }  // for server-side
--
-- For high-concurrency scenarios (>50 concurrent API requests):
--   - Consider Supabase Pro plan for more pooled connections
--   - Use connection string with ?pgbouncer=true for serverless

-- ── Unused index cleanup ────────────────────────────────────────────────────
-- Run this query periodically to find unused indexes (waste disk + slow writes):
--
-- SELECT
--   schemaname, tablename, indexname,
--   idx_scan AS times_used,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0
--   AND indexrelid NOT IN (SELECT conindid FROM pg_constraint)
-- ORDER BY pg_relation_size(indexrelid) DESC;

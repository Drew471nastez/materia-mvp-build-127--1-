-- ============================================================
-- Storelib AI — the lookup every visitor pays for
-- ============================================================
--
-- Resolving <slug>.storelib.com to its live deployment is the
-- first thing a visitor's request does on a cache miss, and it
-- was a SEQUENTIAL SCAN of every deployment on the platform.
--
-- Measured on Postgres 16 with 20,000 published sites:
--
--   slug ILIKE 'x'      Seq Scan     9.25 ms   (20,000 rows scanned)
--   slug =     'x'      Seq Scan     2.45 ms   (20,000 rows scanned)
--   lower(slug) = 'x'   Index Scan   0.02 ms
--
-- `uniq_site_deployments_live_slug` already exists, but it is on
-- `lower(slug)`, and neither ILIKE nor a plain equality can use an
-- expression index — the planner has no way to know the column and
-- the expression agree. The unique index stays as the correctness
-- constraint; this one exists to be READ.
--
-- A plain column index rather than a second expression index,
-- because every slug is written lowercase at the source
-- (lib/sites/slug.ts lowercases, and the hostname rule rejects
-- anything else), so the column and its lowercase form are the same
-- string and the simpler index is the one PostgREST's `eq` can use.
--
-- PARTIAL on is_live: only live rows are ever resolved this way, and
-- a site that has been published fifty times has forty-nine rows
-- that this lookup must never consider.
CREATE INDEX IF NOT EXISTS idx_site_deployments_live_slug_lookup
  ON site_deployments (slug) WHERE is_live;

-- The publish-time uniqueness probe walks up to a dozen candidate
-- slugs, and `uniq_sites_slug` is likewise on lower(slug).
CREATE INDEX IF NOT EXISTS idx_sites_slug_lookup ON sites (slug);

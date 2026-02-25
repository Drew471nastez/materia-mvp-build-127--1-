-- ============================================================================
-- Performance Indexes — 2026-02-25
-- Adds composite indexes for the most common filtered + sorted queries.
-- All use IF NOT EXISTS so this migration is safe to re-run.
-- ============================================================================

-- ── products ────────────────────────────────────────────────────────────────

-- Dashboard: products by creator, filtered by status, sorted by newest
CREATE INDEX IF NOT EXISTS idx_products_creator_status_created
  ON public.products (creator_id, status, created_at DESC);

-- Explore / marketplace: published products sorted by newest
CREATE INDEX IF NOT EXISTS idx_products_published_created
  ON public.products (status, created_at DESC)
  WHERE status = 'published';

-- Product lookup by slug (public store pages)
CREATE INDEX IF NOT EXISTS idx_products_slug
  ON public.products (slug)
  WHERE slug IS NOT NULL;

-- ── orders ──────────────────────────────────────────────────────────────────

-- Dashboard sales: orders for a set of product IDs, sorted by newest
CREATE INDEX IF NOT EXISTS idx_orders_product_created
  ON public.orders (product_id, created_at DESC);

-- Orders by status (completed filtering)
CREATE INDEX IF NOT EXISTS idx_orders_product_status
  ON public.orders (product_id, status);

-- Orders by buyer (library / purchase history)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
  ON public.orders (buyer_id, created_at DESC)
  WHERE buyer_id IS NOT NULL;

-- ── entitlements ────────────────────────────────────────────────────────────

-- Buyer library: all entitlements for a buyer, newest first
CREATE INDEX IF NOT EXISTS idx_entitlements_buyer_created
  ON public.entitlements (buyer_id, created_at DESC);

-- ── creators ────────────────────────────────────────────────────────────────

-- Creator lookup by user_id (used on every authenticated page)
CREATE INDEX IF NOT EXISTS idx_creators_user_id
  ON public.creators (user_id);

-- Creator lookup by slug (public store pages)
CREATE INDEX IF NOT EXISTS idx_creators_slug
  ON public.creators (slug)
  WHERE slug IS NOT NULL;

-- ── profiles ────────────────────────────────────────────────────────────────

-- Profile lookup by username (public pages)
CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles (username)
  WHERE username IS NOT NULL;

-- ── onepages ────────────────────────────────────────────────────────────────

-- OnePage lookup by owner (dashboard)
CREATE INDEX IF NOT EXISTS idx_onepages_owner
  ON public.onepages (owner_id);

-- OnePage lookup by slug (public link-in-bio pages)
CREATE INDEX IF NOT EXISTS idx_onepages_slug
  ON public.onepages (slug)
  WHERE slug IS NOT NULL;

-- ── onepage_views ───────────────────────────────────────────────────────────

-- Analytics: views per onepage, sorted by time
CREATE INDEX IF NOT EXISTS idx_onepage_views_onepage_created
  ON public.onepage_views (onepage_id, created_at DESC);

-- ── digital_assets ──────────────────────────────────────────────────────────

-- Download page: assets for a product
CREATE INDEX IF NOT EXISTS idx_digital_assets_product
  ON public.digital_assets (product_id);

-- ── custom_domains ──────────────────────────────────────────────────────────

-- Domain lookup by creator + status (already partially indexed but add composite)
CREATE INDEX IF NOT EXISTS idx_custom_domains_creator_active
  ON public.custom_domains (creator_id, status)
  WHERE status = 'active';

-- ── subscribers ─────────────────────────────────────────────────────────────

-- Email list: subscribers per creator
CREATE INDEX IF NOT EXISTS idx_subscribers_creator_email
  ON public.subscribers (creator_id, email);

-- ── store_builder_configs ───────────────────────────────────────────────────

-- Store config lookup (per-creator, per page type)
CREATE INDEX IF NOT EXISTS idx_store_configs_creator_page
  ON public.store_builder_configs (creator_id, page_type);

-- ── wishlist ────────────────────────────────────────────────────────────────

-- Wishlist by user, newest first
CREATE INDEX IF NOT EXISTS idx_wishlist_user_created
  ON public.wishlist (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

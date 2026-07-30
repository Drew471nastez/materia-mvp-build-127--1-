-- ============================================================================
-- storelib — performance indexes for the marketplace pivot
--
-- Safe to run any time and more than once (every statement is IF NOT EXISTS).
-- This file creates NO tables and changes NO data — indexes only.
--
-- Nothing here is strictly REQUIRED for the features to work; they make the new
-- "total saves" count on listings and the search / autocomplete fast at scale.
-- ============================================================================

-- 1) Total-saves count per listing (feed cards + the Saved tab).
--    The count aggregates public.wishlist_items grouped by product_id, so the
--    product_id index is what keeps that query cheap as saves grow.
create index if not exists idx_wishlist_items_product_id
  on public.wishlist_items (product_id);

-- Fast per-user / per-guest wishlist reads (loading a user's saved items).
create index if not exists idx_wishlist_items_user_id
  on public.wishlist_items (user_id);
create index if not exists idx_wishlist_items_guest_id
  on public.wishlist_items (guest_id);

-- 2) Search + autocomplete used by the full-screen search overlay
--    (/api/v2/search and /api/v2/search/people). Trigram GIN indexes make the
--    ILIKE / fuzzy matching fast. pg_trgm ships with Supabase.
create extension if not exists pg_trgm;

create index if not exists idx_products_title_trgm
  on public.products using gin (title gin_trgm_ops);
create index if not exists idx_products_description_trgm
  on public.products using gin (description gin_trgm_ops);

-- brand exists after 20260730_marketplace_physical_attributes.sql (already run).
create index if not exists idx_products_brand_trgm
  on public.products using gin (brand gin_trgm_ops);

create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (username gin_trgm_ops);
create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

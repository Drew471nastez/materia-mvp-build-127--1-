-- The navigator's recent list (GET /api/me/places, lib/nav/places-server.ts)
-- reads a buyer's last downloads by the ids of their own entitlements and
-- orders. download_events had indexes on the asset, the token and the time
-- only, so that read would scan the table. Two partial indexes, newest
-- first. Safe to run more than once; nothing breaks before it runs, the read
-- is only slower.
create index if not exists idx_download_events_entitlement_recent
  on public.download_events (entitlement_id, created_at desc)
  where entitlement_id is not null;

create index if not exists idx_download_events_order_recent
  on public.download_events (order_id, created_at desc)
  where order_id is not null;

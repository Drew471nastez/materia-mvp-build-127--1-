-- Rows as the old tracker wrote them, before part 54: no property, no path.
INSERT INTO public.profiles (id, username) VALUES ('a0000000-0000-0000-0000-00000000000a', 'ana'), ('b0000000-0000-0000-0000-00000000000b', 'bee'), ('c0000000-0000-0000-0000-00000000000c', 'cee');
INSERT INTO public.creators (id, user_id, slug) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'ana'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'bee'),
  ('cccccccc-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000000c', 'cee');
INSERT INTO public.products (id, creator_id, title) VALUES ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ebook');
INSERT INTO public.store_theme_installs (id, creator_id, status, sort_order) VALUES
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'published', 0),
  ('bbbbbbbb-5555-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'published', 0),
  ('bbbbbbbb-5555-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'draft', 1);
INSERT INTO public.custom_domains (creator_id, domain, status, purpose) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee.com', 'active', 'website'),
  ('cccccccc-0000-0000-0000-000000000003', 'cee.com', 'active', 'creator_page');
INSERT INTO public.onepages (id, seller_id, owner_id, slug) VALUES ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'ana');

INSERT INTO public.analytics_events (id, creator_id, product_id, event_type, session_id, visitor_id, page_url, source_category, device_type, country_code, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'view', 's1', 'v1', 'https://storelib.com/ana', 'direct', 'mobile', 'RO', '2026-09-20 10:00:00+00'),
  ('00000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'view', 's2', 'v2', 'https://ana.storelib.com/about?x=1', 'social_instagram', 'desktop', 'US', '2026-09-20 11:00:00+00'),
  ('00000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'view', 's3', 'v3', NULL, 'direct', 'mobile', 'RO', '2026-09-20 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'buy_click', 's1', 'v1', NULL, NULL, NULL, NULL, '2026-09-20 10:05:00+00'),
  ('00000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', NULL, 'view', 's5', 'v5', 'https://bee.com/', 'direct', 'desktop', 'GB', '2026-09-20 13:00:00+00'),
  ('00000000-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-000000000003', NULL, 'view', 's6', 'v6', 'https://www.cee.com/', 'direct', 'desktop', 'DE', '2026-09-20 14:00:00+00'),
  ('00000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'view', 's7', 'v7', 'http://localhost:3000/ana/ebook', 'direct', 'tablet', NULL, '2026-09-20 15:00:00+00'),
  ('00000000-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'store_view', 's8', 'v8', 'https://storelib.com/ana', NULL, NULL, NULL, '2026-09-20 16:00:00+00');

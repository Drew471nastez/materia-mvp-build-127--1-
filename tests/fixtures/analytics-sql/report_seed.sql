-- A realistic stretch of activity for the reports (tests/analytics-report-sql.test.ts), July to early September 2026.
-- Creator A has a creator page, a OnePage and two websites (W1 live, W2 live before and now offline) and a draft
-- website that was never published. Creator B is a stranger whose rows must never show up under A.
-- Visits cross UTC, Los Angeles and Kolkata midnights; people come back across properties; old rows from before
-- part 60 have no path, and some website ones no install; the OnePage's history before its first event row is only
-- in onepage_views (with robots in it), after that it is written to both tables and onepage_views must be ignored.
-- Orders: attributed and not, every status, baskets, refunds in part and in full, disputes, free orders, tips.
-- Deterministic: setseed, and every random() in a fixed column order.
ALTER TABLE public.analytics_events ALTER COLUMN session_id DROP NOT NULL;

INSERT INTO public.profiles (id, username) VALUES ('a1000000-0000-0000-0000-0000000000aa', 'ana'), ('b1000000-0000-0000-0000-0000000000bb', 'bee');
INSERT INTO public.creators (id, user_id, slug) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000aa', 'ana'),
  ('b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-0000000000bb', 'bee');
INSERT INTO public.products (id, creator_id, title) VALUES
  ('a1000000-1111-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Ebook'),
  ('a1000000-1111-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Presets'),
  ('a1000000-1111-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Course'),
  ('b1000000-1111-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Bee guide');
INSERT INTO public.store_theme_installs (id, creator_id, status, sort_order, name, published_at) VALUES
  ('a1000000-5555-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'published', 0, 'Studio', '2026-06-01 00:00+00'),
  ('a1000000-5555-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'unpublished', 1, 'Shop', '2026-06-15 00:00+00'),
  ('a1000000-5555-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'draft', 2, 'Draft site', NULL),
  ('b1000000-5555-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'published', 0, 'Bee site', '2026-05-01 00:00+00');
INSERT INTO public.onepages (id, seller_id, owner_id, slug) VALUES
  ('a1000000-7777-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000aa', 'ana'),
  ('b1000000-7777-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-0000000000bb', 'bee');

SELECT setseed(0.2026);
CREATE TEMP TABLE seed_visit AS
SELECT g,
  CASE WHEN g % 11 = 0 THEN 'b1000000-0000-0000-0000-000000000002'::uuid ELSE 'a1000000-0000-0000-0000-000000000001'::uuid END AS creator,
  (ARRAY['creator_page', 'creator_page', 'creator_page', 'creator_page', 'onepage', 'onepage', 'w1', 'w1', 'w2', 'oldweb'])[1 + floor(random() * 10)::int] AS prop,
  timestamptz '2026-07-01 00:00+00' + random() * interval '67 days' AS t0,
  random() < 0.7 AS consented,
  floor(random() * 650)::int AS person,
  floor(random() * 4)::int AS extra,
  floor(random() * 9)::int AS src,
  floor(random() * 4)::int AS dev,
  floor(random() * 5)::int AS ctry,
  floor(random() * 4)::int AS br,
  random() AS r_step,
  random() AS r_prod
FROM generate_series(1, 3300) g;

-- The OnePage's first row in analytics_events is its first visit from 2026-08-10 12:00 UTC; before that the OnePage
-- was only counted in onepage_views. Old website rows (before 2026-07-20) never knew their install.
CREATE TEMP TABLE seed_page AS
SELECT v.*, k,
  v.t0 + k * interval '7 minutes' AS at,
  CASE v.prop WHEN 'creator_page' THEN (ARRAY['/ana', '/ana/ebook', '/ana/presets', '/ana/course'])[1 + (v.g + k) % 4]
    WHEN 'onepage' THEN '/ana/links'
    WHEN 'w1' THEN (ARRAY['/', '/about', '/products/ebook', '/contact'])[1 + (v.g + k) % 4]
    WHEN 'w2' THEN (ARRAY['/', '/shop', '/products/presets'])[1 + (v.g + k) % 3]
    ELSE (ARRAY['/', '/about'])[1 + (v.g + k) % 2] END AS page
FROM seed_visit v, generate_series(0, CASE v.prop WHEN 'onepage' THEN 0 WHEN 'w2' THEN least(v.extra, 2) WHEN 'oldweb' THEN least(v.extra, 1) ELSE v.extra END) k
WHERE NOT (v.prop = 'oldweb' AND v.t0 >= '2026-07-20 00:00+00');

INSERT INTO public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, property_id, path, page_url, source_category, referrer_domain, utm_campaign, device_type, browser, country_code, created_at)
SELECT p.creator,
  CASE WHEN p.creator <> 'a1000000-0000-0000-0000-000000000001' THEN CASE WHEN p.page IN ('/ana/ebook', '/products/ebook') THEN 'b1000000-1111-0000-0000-000000000001'::uuid END
    WHEN p.page IN ('/ana/ebook', '/products/ebook') THEN 'a1000000-1111-0000-0000-000000000001'::uuid
    WHEN p.page IN ('/ana/presets', '/products/presets') THEN 'a1000000-1111-0000-0000-000000000002'::uuid
    WHEN p.page = '/ana/course' THEN 'a1000000-1111-0000-0000-000000000003'::uuid END,
  'view',
  CASE WHEN p.consented THEN 's_' || p.g ELSE 's_anon_' || p.g END,
  CASE WHEN NOT p.consented THEN 'anon_' || p.person || '_' || to_char(p.t0 AT TIME ZONE 'UTC', 'YYYYMMDD')
    WHEN p.prop IN ('creator_page', 'onepage') THEN 'v_' || p.person ELSE 'w_' || p.person END,
  CASE WHEN p.prop IN ('w1', 'w2', 'oldweb') THEN 'website' ELSE p.prop END,
  CASE p.prop WHEN 'onepage' THEN CASE WHEN p.creator = 'a1000000-0000-0000-0000-000000000001' THEN 'a1000000-7777-0000-0000-000000000001' ELSE 'b1000000-7777-0000-0000-000000000001' END
    WHEN 'w1' THEN CASE WHEN p.creator = 'a1000000-0000-0000-0000-000000000001' THEN 'a1000000-5555-0000-0000-000000000001' ELSE 'b1000000-5555-0000-0000-000000000001' END
    WHEN 'w2' THEN CASE WHEN p.creator = 'a1000000-0000-0000-0000-000000000001' THEN 'a1000000-5555-0000-0000-000000000002' ELSE 'b1000000-5555-0000-0000-000000000001' END END::uuid,
  CASE WHEN p.t0 < '2026-07-20 00:00+00' THEN NULL ELSE p.page END,
  CASE WHEN p.prop IN ('creator_page', 'onepage') THEN 'https://storelib.com' ELSE 'https://ana.storelib.com' END || p.page,
  (ARRAY['direct', 'social_instagram', 'social_instagram', 'social_tiktok', 'organic_search', 'referral', 'email', 'social_youtube', 'paid'])[1 + p.src],
  (ARRAY['Direct', 'l.instagram.com', 'www.instagram.com', 'tiktok.com', 'www.google.com', 'blog.example.org', 'Direct', 'youtube.com', 'Direct'])[1 + p.src],
  CASE WHEN p.src IN (6, 8) THEN (ARRAY['summer', 'launch'])[1 + p.g % 2] END,
  (ARRAY['mobile', 'desktop', 'tablet', NULL])[1 + p.dev],
  (ARRAY['Safari', 'Chrome', 'Firefox', NULL])[1 + p.br],
  (ARRAY['RO', 'US', 'IN', 'GB', NULL])[1 + p.ctry],
  p.at
FROM seed_page p
WHERE NOT (p.prop = 'onepage' AND p.t0 < '2026-08-10 12:00+00');

-- The OnePage as app/api/onepage/track counts it: one row per address a day, a hashed id of its own (not the
-- analytics visitor id), robots included. Before the switch these are the only record; after it they are a second
-- copy of visits the events already hold.
INSERT INTO public.onepage_views (onepage_id, visitor_id, referrer, user_agent, ip_hash, country_code, country_name, created_at)
SELECT CASE WHEN p.creator = 'a1000000-0000-0000-0000-000000000001' THEN 'a1000000-7777-0000-0000-000000000001' ELSE 'b1000000-7777-0000-0000-000000000001' END::uuid,
  md5('op' || p.person), (ARRAY['', 'https://l.instagram.com/', 'https://l.instagram.com/', 'https://www.tiktok.com/', 'https://www.google.com/', 'https://blog.example.org/post', '', 'https://www.youtube.com/', ''])[1 + p.src],
  CASE WHEN p.dev = 0 THEN 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' ELSE 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' END,
  md5('ip' || p.person), (ARRAY['RO', 'US', 'IN', 'GB', NULL])[1 + p.ctry], NULL, p.at
FROM seed_page p WHERE p.prop = 'onepage';
-- Robots in the old table: a crawler and a link preview. Never a visitor.
INSERT INTO public.onepage_views (onepage_id, visitor_id, referrer, user_agent, ip_hash, country_code, created_at)
SELECT 'a1000000-7777-0000-0000-000000000001', md5('bot' || g), '', (ARRAY['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'])[1 + g % 2], md5('botip' || g), 'US', timestamptz '2026-07-02 03:00+00' + g * interval '9 hours'
FROM generate_series(1, 80) g;

-- Link taps on the OnePage: onepage_clicks always (one per id, block and day), link_click events after the switch.
INSERT INTO public.onepage_clicks (onepage_id, block_id, url, visitor_id, created_at)
SELECT 'a1000000-7777-0000-0000-000000000001', (ARRAY['blk-shop', 'blk-yt', 'blk-ig'])[1 + p.g % 3], (ARRAY['https://ana.storelib.com/', 'https://youtube.com/@ana', 'https://instagram.com/ana'])[1 + p.g % 3], md5('op' || p.person), p.at + interval '40 seconds'
FROM seed_page p WHERE p.prop = 'onepage' AND p.creator = 'a1000000-0000-0000-0000-000000000001' AND p.r_step < 0.55;
INSERT INTO public.analytics_events (creator_id, event_type, session_id, visitor_id, property_type, property_id, path, link_id, link_url, created_at)
SELECT e.creator_id, 'link_click', e.session_id, e.visitor_id, 'onepage', e.property_id, e.path, (ARRAY['blk-shop', 'blk-yt', 'blk-ig'])[1 + v.g % 3], (ARRAY['https://ana.storelib.com/', 'https://youtube.com/@ana', 'https://instagram.com/ana'])[1 + v.g % 3], e.created_at + interval '40 seconds'
FROM public.analytics_events e JOIN seed_visit v ON e.session_id IN ('s_' || v.g, 's_anon_' || v.g)
WHERE e.property_type = 'onepage' AND e.event_type = 'view' AND e.creator_id = 'a1000000-0000-0000-0000-000000000001' AND v.r_step < 0.55;
-- Links out of the creator page.
INSERT INTO public.analytics_events (creator_id, event_type, session_id, visitor_id, property_type, property_id, path, link_url, created_at)
SELECT e.creator_id, 'link_click', e.session_id, e.visitor_id, e.property_type, e.property_id, e.path, 'https://instagram.com/ana', e.created_at + interval '2 minutes'
FROM public.analytics_events e WHERE e.event_type = 'view' AND e.property_type = 'creator_page' AND e.path = '/ana' AND e.creator_id = 'a1000000-0000-0000-0000-000000000001' AND e.visitor_id LIKE '%3';

-- Buy pressed and checkout opened: on a product page view, a third of them; the checkout takes the visit's property,
-- except some that could not be placed (null), as collect() leaves them.
INSERT INTO public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, property_id, path, created_at)
SELECT e.creator_id, e.product_id, s.step, e.session_id, e.visitor_id,
  CASE WHEN s.step = 'checkout_start' AND right(e.session_id, 1) = '7' THEN NULL ELSE e.property_type END,
  CASE WHEN s.step = 'checkout_start' AND right(e.session_id, 1) = '7' THEN NULL ELSE e.property_id END,
  CASE WHEN s.step = 'buy_click' THEN e.path ELSE '/checkout' END,
  e.created_at + CASE WHEN s.step = 'buy_click' THEN interval '1 minute' ELSE interval '2 minutes' END
FROM public.analytics_events e CROSS JOIN (VALUES ('buy_click'), ('checkout_start')) s(step)
WHERE e.event_type = 'view' AND e.product_id IS NOT NULL AND e.path IS NOT NULL AND abs(hashtext(e.session_id)) % 3 = 0;

-- Orders. First the ones placed by hand, each one a rule:
INSERT INTO public.orders (id, product_id, amount_cents, tip_cents, status, stripe_session_id, refund_amount_cents, source, source_detail, property_type, property_id, attributed_at, buyer_country_code, created_at) VALUES
  -- Attributed, one per property, around midnights of each zone.
  ('0a000000-0000-0000-0000-000000000001', 'a1000000-1111-0000-0000-000000000001', 2900, 0, 'completed', 'cs_1', NULL, 'storelib', '{"surface":"profile"}', 'creator_page', 'a1000000-0000-0000-0000-000000000001', '2026-08-01 06:59+00', 'RO', '2026-08-01 06:59:59+00'),
  ('0a000000-0000-0000-0000-000000000002', 'a1000000-1111-0000-0000-000000000002', 1500, 300, 'completed', 'cs_2', NULL, 'storelib', '{"surface":"onepage"}', 'onepage', 'a1000000-7777-0000-0000-000000000001', '2026-08-01 07:00+00', 'US', '2026-08-01 07:00:00+00'),
  ('0a000000-0000-0000-0000-000000000003', 'a1000000-1111-0000-0000-000000000001', 4900, 0, 'completed', 'cs_3', NULL, 'website', '{"surface":"website"}', 'website', 'a1000000-5555-0000-0000-000000000001', '2026-07-31 18:29+00', 'IN', '2026-07-31 18:29:59+00'),
  ('0a000000-0000-0000-0000-000000000004', 'a1000000-1111-0000-0000-000000000002', 4900, 0, 'completed', 'cs_4', NULL, 'website', '{"surface":"website"}', 'website', 'a1000000-5555-0000-0000-000000000002', '2026-07-31 18:30+00', 'IN', '2026-07-31 18:30:00+00'),
  -- A website order whose install could not be read in time: the type is set, the id is not (the live website).
  ('0a000000-0000-0000-0000-000000000005', 'a1000000-1111-0000-0000-000000000003', 9900, 0, 'completed', 'cs_5', NULL, 'website', NULL, 'website', NULL, '2026-08-12 10:00+00', 'GB', '2026-08-12 10:00:00+00'),
  -- Refunded in part, and in full; a dispute; a failed and a pending payment; a free order.
  ('0a000000-0000-0000-0000-000000000006', 'a1000000-1111-0000-0000-000000000001', 5000, 0, 'refunded', 'cs_6', 500, 'storelib', NULL, 'creator_page', 'a1000000-0000-0000-0000-000000000001', '2026-08-05 12:00+00', 'RO', '2026-08-05 12:00:00+00'),
  ('0a000000-0000-0000-0000-000000000007', 'a1000000-1111-0000-0000-000000000001', 3000, 0, 'refunded', 'cs_7', NULL, 'storelib', NULL, 'creator_page', 'a1000000-0000-0000-0000-000000000001', '2026-08-06 12:00+00', 'RO', '2026-08-06 12:00:00+00'),
  ('0a000000-0000-0000-0000-000000000008', 'a1000000-1111-0000-0000-000000000002', 7000, 0, 'disputed', 'cs_8', NULL, 'website', NULL, 'website', 'a1000000-5555-0000-0000-000000000001', '2026-08-07 12:00+00', 'US', '2026-08-07 12:00:00+00'),
  ('0a000000-0000-0000-0000-000000000009', 'a1000000-1111-0000-0000-000000000002', 7000, 0, 'failed', 'cs_9', NULL, 'storelib', NULL, 'onepage', 'a1000000-7777-0000-0000-000000000001', '2026-08-08 12:00+00', 'US', '2026-08-08 12:00:00+00'),
  ('0a000000-0000-0000-0000-000000000010', 'a1000000-1111-0000-0000-000000000002', 7000, 0, 'pending', 'cs_10', NULL, 'storelib', NULL, 'onepage', 'a1000000-7777-0000-0000-000000000001', '2026-08-09 12:00+00', 'US', '2026-08-09 12:00:00+00'),
  ('0a000000-0000-0000-0000-000000000011', 'a1000000-1111-0000-0000-000000000003', 0, 0, 'completed', 'cs_11', NULL, 'storelib', '{"surface":"onepage"}', 'onepage', 'a1000000-7777-0000-0000-000000000001', '2026-08-10 12:00+00', NULL, '2026-08-10 12:00:00+00'),
  -- A basket of two lines, one payment, attributed on both lines.
  ('0a000000-0000-0000-0000-000000000012', 'a1000000-1111-0000-0000-000000000001', 2000, 0, 'completed', 'cs_basket', NULL, 'website', NULL, 'website', 'a1000000-5555-0000-0000-000000000002', '2026-08-15 23:50+00', 'RO', '2026-08-15 23:50:00+00'),
  ('0a000000-0000-0000-0000-000000000013', 'a1000000-1111-0000-0000-000000000002', 1000, 0, 'completed', 'cs_basket', NULL, 'website', NULL, 'website', 'a1000000-5555-0000-0000-000000000002', '2026-08-15 23:50+00', 'RO', '2026-08-15 23:50:01+00'),
  -- Before part 59: no property. The source says website (the live website), the surface says OnePage, or
  -- nothing is known (the creator page); a basket with no source at all is a website's (lib/orders/order-view).
  ('0a000000-0000-0000-0000-000000000014', 'a1000000-1111-0000-0000-000000000001', 2500, 0, 'completed', 'old_1', NULL, 'website', NULL, NULL, NULL, NULL, 'RO', '2026-07-10 10:00:00+00'),
  ('0a000000-0000-0000-0000-000000000015', 'a1000000-1111-0000-0000-000000000002', 1900, 0, 'completed', 'old_2', NULL, 'storelib', '{"surface":"onepage"}', NULL, NULL, NULL, 'US', '2026-07-11 10:00:00+00'),
  ('0a000000-0000-0000-0000-000000000016', 'a1000000-1111-0000-0000-000000000003', 3900, 0, 'completed', 'old_3', NULL, NULL, NULL, NULL, NULL, NULL, 'US', '2026-07-12 10:00:00+00'),
  ('0a000000-0000-0000-0000-000000000017', 'a1000000-1111-0000-0000-000000000001', 1200, 0, 'completed', 'old_basket', NULL, NULL, NULL, NULL, NULL, NULL, 'GB', '2026-07-13 10:00:00+00'),
  ('0a000000-0000-0000-0000-000000000018', 'a1000000-1111-0000-0000-000000000003', 1800, 0, 'refunded', 'old_basket', 800, NULL, NULL, NULL, NULL, NULL, 'GB', '2026-07-13 10:00:01+00'),
  ('0a000000-0000-0000-0000-000000000019', 'a1000000-1111-0000-0000-000000000002', 2200, 0, 'completed', NULL, NULL, 'storelib', '{"surface":"product"}', NULL, NULL, NULL, 'RO', '2026-08-02 04:00:00+00'),
  -- Creator B's own sales, on the same days.
  ('0b000000-0000-0000-0000-000000000001', 'b1000000-1111-0000-0000-000000000001', 99900, 0, 'completed', 'bee_1', NULL, 'website', NULL, 'website', 'b1000000-5555-0000-0000-000000000001', '2026-08-05 10:00+00', 'US', '2026-08-05 10:00:00+00'),
  ('0b000000-0000-0000-0000-000000000002', 'b1000000-1111-0000-0000-000000000001', 50000, 0, 'completed', 'bee_2', NULL, 'storelib', NULL, 'creator_page', 'b1000000-0000-0000-0000-000000000002', '2026-08-06 10:00+00', 'US', '2026-08-06 10:00:00+00');
-- Then many ordinary ones: a product view's visit that went on to buy, on the visit's property, at a price of the product.
INSERT INTO public.orders (product_id, amount_cents, tip_cents, status, stripe_session_id, refund_amount_cents, source, source_detail, property_type, property_id, attributed_at, buyer_country_code, created_at)
SELECT e.product_id, (ARRAY[1900, 2900, 4900, 0])[1 + abs(hashtext(e.session_id || 'p')) % 4], CASE WHEN abs(hashtext(e.session_id)) % 5 = 0 THEN 200 ELSE 0 END,
  (ARRAY['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'refunded', 'disputed', 'failed', 'completed'])[1 + abs(hashtext(e.session_id || 's')) % 10],
  'cs_auto_' || e.id, CASE WHEN abs(hashtext(e.session_id || 'r')) % 2 = 0 THEN 400 END,
  CASE WHEN e.property_type = 'website' THEN 'website' ELSE 'storelib' END,
  CASE WHEN e.property_type = 'onepage' THEN '{"surface":"onepage"}'::jsonb END,
  CASE WHEN e.created_at >= '2026-07-25 00:00+00' THEN e.property_type END,
  CASE WHEN e.created_at >= '2026-07-25 00:00+00' THEN CASE WHEN e.property_type = 'creator_page' THEN e.creator_id ELSE e.property_id END END,
  CASE WHEN e.created_at >= '2026-07-25 00:00+00' THEN e.created_at END,
  'RO', e.created_at + interval '4 minutes'
FROM public.analytics_events e
WHERE e.event_type = 'checkout_start' AND e.property_type IS NOT NULL AND abs(hashtext(e.session_id || 'o')) % 2 = 0;
UPDATE public.orders o SET creator_id = p.creator_id FROM public.products p WHERE p.id = o.product_id AND o.creator_id IS NULL;

-- Subscribers: every door, legacy rows with only a source_detail or only the old one word source, and
-- imports and manual adds that are not sign-ups.
INSERT INTO public.subscribers (creator_id, email, source, source_detail, property_type, property_id, last_touch, attributed_at, subscribed_at, status)
SELECT 'a1000000-0000-0000-0000-000000000001', 'fan' || g || '@example.com',
  (ARRAY['creator_page', 'onepage', 'website_builder_newsletter', 'checkout', 'import', 'manual', 'onepage', 'creator_page'])[1 + g % 8],
  (ARRAY['{"surface":"profile"}', '{"surface":"onepage"}', '{"surface":"website"}', '{"surface":"checkout"}', '{"surface":"import"}', '{"surface":"manual"}', NULL, NULL])[1 + g % 8]::jsonb,
  CASE WHEN g % 3 = 0 AND g % 8 NOT IN (4, 5, 6, 7) THEN (ARRAY['creator_page', 'onepage', 'website', 'creator_page'])[1 + g % 4] END,
  CASE WHEN g % 3 = 0 AND g % 8 NOT IN (4, 5, 6, 7) THEN (ARRAY['a1000000-0000-0000-0000-000000000001', 'a1000000-7777-0000-0000-000000000001', 'a1000000-5555-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001'])[1 + g % 4]::uuid END,
  CASE WHEN g % 3 = 0 AND g % 8 NOT IN (4, 5, 6, 7) THEN jsonb_build_object('source', (ARRAY['social_instagram', 'direct', 'organic_search', 'email'])[1 + g % 4], 'at', '2026-08-01T00:00:00Z') END,
  CASE WHEN g % 3 = 0 AND g % 8 NOT IN (4, 5, 6, 7) THEN timestamptz '2026-07-01 00:00+00' + g * interval '17 hours' END,
  timestamptz '2026-07-01 00:00+00' + g * interval '17 hours',
  CASE WHEN g % 13 = 0 THEN 'unsubscribed' ELSE 'subscribed' END
FROM generate_series(1, 90) g;
INSERT INTO public.subscribers (creator_id, email, source, source_detail, property_type, property_id, subscribed_at)
VALUES ('b1000000-0000-0000-0000-000000000002', 'bee-fan@example.com', 'website_builder_newsletter', '{"surface":"website"}', 'website', 'b1000000-5555-0000-0000-000000000001', '2026-08-03 10:00+00');

ANALYZE;

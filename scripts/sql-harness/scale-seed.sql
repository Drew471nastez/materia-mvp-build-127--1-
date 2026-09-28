-- MANY ROWS, for the scale scenario: how long file 1 holds its locks on a
-- database with a real shop's volume. Sizes are :'scale' times these (scale 1
-- = 20k accounts, 5k creators, 50k products, 300k orders, 100k library rows,
-- 1M page views, 50k reviews, 100k ledger rows, 200k subscribers). Run as
-- postgres on a copy of the base, after seed.sql.
\set scale 1
set session_replication_role = replica;
insert into auth.users (id, email, created_at, raw_user_meta_data, aud, role)
select ('10000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@example.com', now() - (g || ' minutes')::interval, '{}', 'authenticated', 'authenticated'
from generate_series(1, 20000 * :scale) g;
insert into public.profiles (id, email, display_name, username, is_creator)
select ('10000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@example.com', 'User ' || g, 'user' || g, g <= 5000 * :scale
from generate_series(1, 20000 * :scale) g;
insert into public.creators (id, user_id, slug, display_name, username)
select ('10000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid, ('10000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid, 'creator' || g, 'Creator ' || g, 'user' || g
from generate_series(1, 5000 * :scale) g;
insert into public.products (id, creator_id, type, title, slug, price_cents, status, archived)
select ('10000000-0000-4000-c000-' || lpad(g::text, 12, '0'))::uuid, ('10000000-0000-4000-b000-' || lpad((1 + g % (5000 * :scale))::text, 12, '0'))::uuid,
  'digital', 'Product ' || g, 'product-' || g, 100 + g % 5000, case when g % 10 = 0 then 'draft' else 'published' end, g % 50 = 0
from generate_series(1, 50000 * :scale) g;
insert into public.orders (id, buyer_id, product_id, amount_cents, status, currency, buyer_email, receipt_token, stripe_session_id, created_at)
select ('10000000-0000-4000-d000-' || lpad(g::text, 12, '0'))::uuid, ('10000000-0000-4000-a000-' || lpad((1 + g % (20000 * :scale))::text, 12, '0'))::uuid,
  ('10000000-0000-4000-c000-' || lpad((1 + g % (50000 * :scale))::text, 12, '0'))::uuid, 1000, case when g % 20 = 0 then 'refunded' else 'completed' end, 'usd',
  'u' || (1 + g % (20000 * :scale)) || '@example.com', 'rcpt-s' || g, 'cs_scale_' || (g / 2), now() - (g || ' minutes')::interval
from generate_series(1, 300000 * :scale) g;
insert into public.entitlements (buyer_id, creator_id, product_id)
select ('10000000-0000-4000-a000-' || lpad((1 + g % (20000 * :scale))::text, 12, '0'))::uuid, ('10000000-0000-4000-b000-' || lpad((1 + (1 + g % (50000 * :scale)) % (5000 * :scale))::text, 12, '0'))::uuid,
  ('10000000-0000-4000-c000-' || lpad((1 + g % (50000 * :scale))::text, 12, '0'))::uuid
from generate_series(1, 100000 * :scale) g;
insert into public.reviews (product_id, creator_id, buyer_id, rating, content)
select ('10000000-0000-4000-c000-' || lpad((1 + g % (50000 * :scale))::text, 12, '0'))::uuid, ('10000000-0000-4000-b000-' || lpad((1 + (1 + g % (50000 * :scale)) % (5000 * :scale))::text, 12, '0'))::uuid,
  ('10000000-0000-4000-a000-' || lpad((1 + (g / 3) % (20000 * :scale))::text, 12, '0'))::uuid, 1 + g % 5, 'Review ' || g
from generate_series(1, 50000 * :scale) g;
insert into public.ledger_events (creator_id, event_type, amount_cents, net_seller_cents, fee_cents, currency, order_id)
select ('10000000-0000-4000-b000-' || lpad((1 + g % (5000 * :scale))::text, 12, '0'))::uuid, 'sale', 1000, 870, 130, 'usd', ('10000000-0000-4000-d000-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 100000 * :scale) g;
insert into public.subscribers (creator_id, email, name, status)
select ('10000000-0000-4000-b000-' || lpad((1 + g % (5000 * :scale))::text, 12, '0'))::uuid, 's' || g || '@example.com', 'Sub ' || g, 'subscribed'
from generate_series(1, 200000 * :scale) g;
insert into public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, referrer_domain, country_code, device_type, page_url, created_at)
select ('10000000-0000-4000-b000-' || lpad((1 + g % (5000 * :scale))::text, 12, '0'))::uuid, ('10000000-0000-4000-c000-' || lpad((1 + g % (50000 * :scale))::text, 12, '0'))::uuid,
  case when g % 3 = 0 then 'store_view' else 'product_view' end, 's' || (g / 4), 'v' || (g / 9), 'instagram.com', 'RO', 'mobile', '/creator' || (1 + g % (5000 * :scale)), now() - (g || ' seconds')::interval
from generate_series(1, 1000000 * :scale) g;
insert into public.onepages (owner_id, slug, title, status, draft_blocks)
select ('10000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid, 'page' || g, 'Page ' || g, 'published', '[]'
from generate_series(1, 5000 * :scale) g;
set session_replication_role = origin;
analyze;

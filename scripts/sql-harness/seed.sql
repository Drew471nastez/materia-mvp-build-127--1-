-- A FEW ROWS, so the parts that rewrite existing rows (05, 08, 32, 43, 44,
-- 47, 53, 61 and the rest) have something to rewrite, and a second run can
-- be seen to leave them alone. Two creators, a buyer, their products, a sale
-- with its library row, ledger rows, a review, a OnePage whose address has
-- capitals, page views. Fixed ids so a log line can be traced to its row.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at, aud, role) values
  ('00000000-0000-4000-a000-000000000001', 'mara@example.com', now(), '{"full_name": "Mara Pop", "avatar_url": "https://lh3.googleusercontent.com/a/mara"}', now() - interval '90 days', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000002', 'ben@example.com', now(), '{"full_name": "Ben Buyer"}', now() - interval '60 days', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000003', 'ioana@example.com', null, '{}', now() - interval '30 days', 'authenticated', 'authenticated'),
  -- Part 97: a Google picture and no profile photo (it gets the picture), and one who removed theirs (it stays removed).
  ('00000000-0000-4000-a000-000000000004', 'lia@example.com', now(), '{"full_name": "Lia Pic", "picture": "https://lh3.googleusercontent.com/a/lia"}', now() - interval '20 days', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000005', 'tom@example.com', now(), '{"full_name": "Tom Gone", "avatar_url": "https://lh3.googleusercontent.com/a/tom", "storelib_avatar_chosen": true}', now() - interval '10 days', 'authenticated', 'authenticated'),
  -- Part 103: a Google account the trigger named after its email (it gets Google's name), and a profile with no name and a handle (it gets the handle's words).
  ('00000000-0000-4000-a000-000000000006', 'jsmith92@example.com', now(), '{"full_name": "John Smith"}', now() - interval '5 days', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-000000000007', 'q8x2kz7v@example.com', now(), '{}', now() - interval '4 days', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name, avatar_url, is_creator, username) values
  ('00000000-0000-4000-a000-000000000001', 'mara@example.com', 'Mara Pop', 'https://lh3.googleusercontent.com/a/mara', true, 'mara'),
  ('00000000-0000-4000-a000-000000000002', 'ben@example.com', 'Ben Buyer', null, false, 'ben'),
  ('00000000-0000-4000-a000-000000000003', 'ioana@example.com', 'Ioana', null, true, 'ioana'),
  ('00000000-0000-4000-a000-000000000004', 'lia@example.com', 'Lia Pic', null, false, 'lia'),
  ('00000000-0000-4000-a000-000000000005', 'tom@example.com', 'Tom Gone', '', false, 'tom'),
  ('00000000-0000-4000-a000-000000000006', 'jsmith92@example.com', 'jsmith92', null, false, 'jsmith92'),
  ('00000000-0000-4000-a000-000000000007', 'q8x2kz7v@example.com', null, null, false, 'maya-prints')
on conflict (id) do nothing;
-- The new user trigger made those two rows first (with the email's letters as the name), so the second is set here as part 103 finds it: no name, a handle.
update public.profiles set display_name = null, username = 'maya-prints' where id = '00000000-0000-4000-a000-000000000007';

insert into public.creators (id, user_id, slug, bio, display_name, avatar_url, stripe_account_id, username) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'mara', 'Prints and presets', 'Mara Pop', 'https://example.com/old-mara.png', 'acct_mara', 'mara'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', 'ioana', null, 'Ioana', null, null, 'ioana')
on conflict (id) do nothing;

insert into public.products (id, creator_id, type, title, slug, description, price_cents, status, archived, category) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'digital', 'Film presets', 'film-presets', 'Twelve presets', 1500, 'published', false, 'design'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 'digital', 'Old guide', 'old-guide', 'Archived the old way', 900, 'published', true, 'design'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000003', 'course', 'Watercolour course', 'watercolour', null, 4900, 'draft', false, null)
on conflict (id) do nothing;

insert into public.product_variants (id, product_id, name, price_cents, position) values
  ('00000000-0000-4000-c100-000000000001', '00000000-0000-4000-c000-000000000001', 'Standard', 1500, 0)
on conflict (id) do nothing;

insert into public.digital_assets (id, product_id, file_path, file_name, file_size, mime_type, storage_bucket) values
  ('00000000-0000-4000-c200-000000000001', '00000000-0000-4000-c000-000000000001', 'mara/film-presets.zip', 'film-presets.zip', 123456, 'application/zip', 'digital-products')
on conflict (id) do nothing;

insert into public.orders (id, buyer_id, product_id, amount_cents, status, currency, buyer_email, receipt_token, stripe_session_id, created_at) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000001', 1500, 'completed', 'usd', 'ben@example.com', 'rcpt-1', 'cs_test_1', now() - interval '10 days'),
  ('00000000-0000-4000-d000-000000000002', null, '00000000-0000-4000-c000-000000000002', 900, 'completed', 'usd', 'guest@example.com', 'rcpt-2', 'cs_test_2', now() - interval '5 days')
on conflict (id) do nothing;

insert into public.entitlements (id, buyer_id, creator_id, product_id) values
  ('00000000-0000-4000-d100-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001')
on conflict (id) do nothing;

insert into public.reviews (id, product_id, creator_id, buyer_id, order_id, rating, content) values
  ('00000000-0000-4000-d200-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-d000-000000000001', 5, 'Lovely presets')
on conflict (id) do nothing;

insert into public.seller_ledger (creator_id, pending_amount, available_amount, lifetime_earnings) values
  ('00000000-0000-4000-b000-000000000001', 0, 1305, 1305)
on conflict do nothing;

insert into public.ledger_events (id, creator_id, event_type, amount_cents, net_seller_cents, fee_cents, currency, order_id, description) values
  ('00000000-0000-4000-d300-000000000001', '00000000-0000-4000-b000-000000000001', 'sale', 1500, 1305, 195, 'usd', '00000000-0000-4000-d000-000000000001', 'Film presets')
on conflict (id) do nothing;

insert into public.subscribers (creator_id, email, name, status) values
  ('00000000-0000-4000-b000-000000000001', 'fan@example.com', 'A fan', 'subscribed')
on conflict do nothing;

insert into public.onepages (id, owner_id, slug, title, avatar_url, status, draft_blocks, published_blocks, published_profile, settings) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000001', 'MaraPop', 'Mara', 'https://lh3.googleusercontent.com/a/mara', 'published',
   '[{"id": "b1", "type": "product", "data": {"productId": "00000000-0000-4000-c000-000000000002", "title": "Old guide"}}]',
   '[{"id": "b1", "type": "product", "data": {"productId": "00000000-0000-4000-c000-000000000002", "title": "Old guide"}}]',
   '{"title": "Mara", "bio": "", "avatar_url": "https://lh3.googleusercontent.com/a/mara"}', '{"seo_title": "Mara"}')
on conflict (id) do nothing;

insert into public.store_builder_configs (creator_id, page_type, draft_config, published_config) values
  ('00000000-0000-4000-b000-000000000001', 'shop', '{"headerSettings": {"avatarUrl": "https://example.com/old-mara.png"}}', '{"headerSettings": {"avatarUrl": "https://example.com/old-mara.png"}}')
on conflict do nothing;

insert into public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, referrer_domain, country_code, device_type, page_url, created_at)
select '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'product_view', 's' || g, 'v' || (g % 7), 'instagram.com', 'RO', 'mobile', '/mara/film-presets', now() - (g || ' hours')::interval
from generate_series(1, 50) g;

insert into storage.buckets (id, name, public) values ('digital-products', 'digital-products', true) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name, owner, owner_id) values ('digital-products', '00000000-0000-4000-a000-000000000001/film-presets.zip', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001') on conflict do nothing;

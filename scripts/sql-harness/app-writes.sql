-- WHAT THE APP WRITES ONCE THE FILES HAVE RUN, using the values the parts
-- newly allow. run.sh applies it as the service role between the first run
-- and the second, so the second run meets rows an early part never saw: a
-- part that re-adds an older, narrower check (validated) or rebuilds an
-- index these rows break would fail the second run here, as it would on
-- production the next time the owner pastes the files.
set role service_role;
insert into public.products (id, creator_id, type, title, slug, price_cents, status) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-000000000001', 'membership', 'Monthly club', 'monthly-club', 500, 'published'),
  ('00000000-0000-4000-c000-0000000000a2', '00000000-0000-4000-b000-000000000001', 'digital', 'Retired pack', 'retired-pack', 700, 'archived');
insert into public.orders (id, buyer_id, product_id, amount_cents, status, currency, buyer_email, receipt_token, stripe_session_id, source, property_type, first_touch) values
  ('00000000-0000-4000-d000-0000000000a1', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-0000000000a1', 500, 'disputed', 'usd', 'ben@example.com', 'rcpt-a1', 'cs_test_a1', 'website', 'website', '{"source": "instagram"}');
insert into public.analytics_events (creator_id, product_id, event_type, session_id, visitor_id, property_type, path, device_type) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'link_click', 'sa1', 'va1', 'onepage', '/marapop', 'desktop'),
  ('00000000-0000-4000-b000-000000000001', null, 'download', 'sa2', 'va2', 'creator_page', '/mara', 'tablet');
insert into public.email_logs (order_id, email_type, recipient_email, status) values
  ('00000000-0000-4000-d000-0000000000a1', 'seller_message', 'mara@example.com', 'sent');
insert into public.email_suppressions (email, scope, reason, source) values ('ben@example.com', 'review_requests', 'unsubscribe', 'review_link');
insert into public.subscribers (creator_id, email, name, status, property_type) values
  ('00000000-0000-4000-b000-000000000001', 'wrote@example.com', 'Wrote in', 'wrote', 'website');
insert into public.email_flows (creator_id, name, trigger_type, status) values
  ('00000000-0000-4000-b000-000000000001', 'Leaves checkout', 'abandoned_checkout', 'paused');
insert into public.reviews (product_id, creator_id, buyer_id, order_id, rating, content, reviewer_name, status, seller_reply) values
  ('00000000-0000-4000-c000-0000000000a1', '00000000-0000-4000-b000-000000000001', null, '00000000-0000-4000-d000-0000000000a1', 4, 'A guest review', 'Guest', 'hidden', 'Thank you');
insert into public.push_tokens (user_id, token, platform) values ('00000000-0000-4000-a000-000000000001', 'web-push-token', 'web');
-- Part 174: a cash on delivery order, its cash marked received.
insert into public.commerce_checkouts (creator_id, buyer_email, status, provider, total_cents, client_key, receipt_token, cod_collected_at) values
  ('00000000-0000-4000-b000-000000000001', 'ben@example.com', 'paid', 'cod', 2500, 'cod-client-key-a1', 'cod-receipt-a1', now());
update public.onepages set share_image_mode = 'card' where id = '00000000-0000-4000-e000-000000000001';
reset role;

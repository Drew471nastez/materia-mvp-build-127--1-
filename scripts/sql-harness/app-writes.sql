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
-- Part 175: a store translating its changes automatically, with its last run.
insert into public.store_localization (creator_id, default_language, languages, auto_translate, auto_translate_run) values
  ('00000000-0000-4000-b000-000000000001', 'en', '[{"code":"fr","published":true}]', true, '{"at":"2026-10-13T10:00:00Z","translated":12,"left":0}');
update public.onepages set share_image_mode = 'card' where id = '00000000-0000-4000-e000-000000000001';
-- Part 220: a community with a 160 character short description and four member links, one hidden.
insert into public.communities (id, creator_id, owner_user_id, slug, name, summary, member_links) values
  ('00000000-0000-4000-f220-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'harness-club', 'Harness club', repeat('x', 160), '[{"id":"a1b2c3d4","label":"Start here","url":"/learn","icon":"book-open","hidden":false},{"id":"e5f6g7h8","label":"Shop","url":"https://example.com/shop","icon":null,"hidden":false},{"id":"i9j0k1l2","label":"Calendar","url":"https://cal.example.com/x","icon":"calendar","hidden":true},{"id":"m3n4o5p6","label":"Notes","url":"/notes","icon":"file-text","hidden":false}]');
-- Part 221 (on part 220's community above): a member pressing a community's member link twice the same day is one row; the next day is another.
insert into public.community_member_link_clicks (community_id, link_id, user_id, day) values ('00000000-0000-4000-f220-000000000001', 'a1b2c3d4', '00000000-0000-4000-a000-000000000002', '2026-10-17') on conflict do nothing;
insert into public.community_member_link_clicks (community_id, link_id, user_id, day) values ('00000000-0000-4000-f220-000000000001', 'a1b2c3d4', '00000000-0000-4000-a000-000000000002', '2026-10-17') on conflict do nothing;
insert into public.community_member_link_clicks (community_id, link_id, user_id, day) values ('00000000-0000-4000-f220-000000000001', 'a1b2c3d4', '00000000-0000-4000-a000-000000000002', '2026-10-18') on conflict do nothing;
do $$ begin if (select count(*) from public.community_member_link_clicks where link_id = 'a1b2c3d4') <> 2 then raise exception 'part 221: a second press the same day made a second row'; end if; end $$;
-- Part 222 (on part 220's community above): a post scheduled with two pictures, a GIF, a link card and a three day poll, and a draft with a half written poll; a list that is not a list is refused.
insert into public.community_scheduled_posts (id, community_id, author_id, title, body, status, publish_at, media, poll) values
  ('00000000-0000-4000-f222-000000000001', '00000000-0000-4000-f220-000000000001', '00000000-0000-4000-a000-000000000001', 'Kiln day', 'Pictures from the firing.', 'scheduled', now() + interval '2 days', '[{"type":"image","url":"https://placeholder.supabase.co/storage/v1/object/public/product-images/a/community/b/1700000000000_x1.webp","w":1200,"h":900},{"type":"image","url":"https://placeholder.supabase.co/storage/v1/object/public/product-images/a/community/b/1700000000001_x2.webp"},{"type":"gif","url":"https://media.giphy.com/media/abc/giphy.gif","still":"https://media.giphy.com/media/abc/giphy_s.gif"},{"type":"link","url":"https://example.com/glazes","title":"Glazes"}]', '{"question":"Which glaze next?","options":["Celadon","Tenmoku"],"multiple":false,"closesInDays":3}'),
  ('00000000-0000-4000-f222-000000000002', '00000000-0000-4000-f220-000000000001', '00000000-0000-4000-a000-000000000001', '', 'Half written', 'draft', null, '[]', '{"question":"","options":[""],"multiple":false,"closesInDays":null}');
do $$ begin begin insert into public.community_scheduled_posts (community_id, author_id, title, body, status, media) values ('00000000-0000-4000-f220-000000000001', '00000000-0000-4000-a000-000000000001', 'x', 'y', 'draft', '{"type":"image"}'); raise exception 'part 222: a media value that is not a list was kept'; exception when check_violation then null; end; end $$;
reset role;

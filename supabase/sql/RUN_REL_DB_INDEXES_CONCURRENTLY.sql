-- ###########################################################################
--  STORELIB: THE INDEXES OF RUN-NOW PART 334, BUILT WITHOUT STOPPING WRITES
-- ###########################################################################
--
--  The same indexes as supabase/sql/run-now/334_database_load_and_isolation.sql,
--  with the same names and definitions, built with CREATE INDEX CONCURRENTLY.
--
--  WHY. A plain CREATE INDEX takes a SHARE lock on its table: reads go on,
--  but every insert, update and delete waits until the index is built. The
--  SQL editor runs a paste as one transaction and keeps every lock until the
--  paste ends, so on a large campaign_recipients, email_recipients,
--  community_messages or checkout_starts table part 334 would hold up every
--  send, chat message and checkout for as long as the rest of the file takes.
--  CONCURRENTLY builds the index while writes continue.
--
--  HOW. CONCURRENTLY refuses to run inside a transaction, and the SQL editor
--  turns a paste of several statements into one. So:
--    - in the Supabase SQL editor, run ONE LINE AT A TIME: select a single
--      CREATE INDEX line below, press Run, wait for Success, then the next;
--    - or with psql, which runs each statement on its own:
--        psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/sql/RUN_REL_DB_INDEXES_CONCURRENTLY.sql
--  Then run part 334 as usual. It finds every index already made and takes
--  no lock for it.
--
--  A LINE WHOSE TABLE OR COLUMN IS NOT THERE fails with "does not exist",
--  which changes nothing: skip it (part 334 skips it too, with a notice).
--
--  IF A LINE FAILS PART WAY (a timeout, a cancelled query), Postgres leaves an
--  INVALID index of that name behind, and IF NOT EXISTS would then skip it.
--  Drop it and run the line again:
--    DROP INDEX CONCURRENTLY IF EXISTS public.<the index name>;
--  To see any invalid one:
--    select indexrelid::regclass from pg_index where not indisvalid;
--
--  Safe to run again: each line is IF NOT EXISTS.
-- ###########################################################################

CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_order_events_creator_kind_idx ON public.commerce_order_events (creator_id, kind, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS email_flow_sends_creator_status_idx ON public.email_flow_sends (creator_id, status, sent_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS onepages_creator_idx ON public.onepages (creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS onepages_seller_idx ON public.onepages (seller_id) WHERE seller_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_messages_community_created_idx ON public.community_messages (community_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_direct_messages_community_created_idx ON public.community_direct_messages (community_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_group_messages_community_created_idx ON public.community_chat_group_messages (community_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_messages_reply_idx ON public.community_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_direct_messages_reply_idx ON public.community_direct_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_chat_group_messages_reply_idx ON public.community_chat_group_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS campaign_recipients_subscriber_idx ON public.campaign_recipients (subscriber_id) WHERE subscriber_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS email_recipients_subscriber_idx ON public.email_recipients (subscriber_id) WHERE subscriber_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_notifications_community_idx ON public.community_notifications (community_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_space_reads_space_idx ON public.community_space_reads (space_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS checkout_starts_product_idx ON public.checkout_starts (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_members_source_product_idx ON public.community_members (source_product_id) WHERE source_product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS course_enrollments_product_idx ON public.course_enrollments (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS review_requests_product_idx ON public.review_requests (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS seller_notifications_order_idx ON public.seller_notifications (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS inventory_reservations_variant_idx ON public.inventory_reservations (variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_channel_listings_product_idx ON public.product_channel_listings (product_id);

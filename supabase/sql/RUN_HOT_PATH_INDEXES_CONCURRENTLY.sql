-- ###########################################################################
--  STORELIB: THE INDEXES OF RUN-NOW PART 187, BUILT WITHOUT STOPPING WRITES
-- ###########################################################################
--
--  The same eight indexes as supabase/sql/run-now/187_hot_path_indexes.sql,
--  with the same names, built with CREATE INDEX CONCURRENTLY.
--
--  WHY. A plain CREATE INDEX takes a SHARE lock on its table: reads go on,
--  but every insert, update and delete waits until the index is built. The
--  SQL editor runs a paste as one transaction and keeps every lock until the
--  paste ends, so in part 187 (and in the built run-four files, where 187 sits
--  inside file 3) a big orders table would hold up every checkout, webhook and
--  receipt for as long as the rest of the file takes. CONCURRENTLY builds the
--  index while writes continue.
--
--  HOW. CONCURRENTLY refuses to run inside a transaction, and the SQL editor
--  turns a paste of several statements into one. So:
--    - in the Supabase SQL editor, run ONE LINE AT A TIME: select a single
--      CREATE INDEX line below, press Run, wait for Success, then the next;
--    - or with psql, which runs each statement on its own:
--        psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/sql/RUN_HOT_PATH_INDEXES_CONCURRENTLY.sql
--  Then run part 187 as usual. It finds every index already made and takes
--  no lock.
--
--  WHICH ONES MATTER. orders, profiles and commerce_checkouts are the tables
--  that grow with every sale and sign up. The last three lines are small
--  tables; run them here or leave them to part 187, either is fine.
--  The community lines need part 81 and the membership line part 75: on a
--  database without those tables, skip the line (it would fail with
--  "relation does not exist", which changes nothing).
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

CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_stripe_session_idx ON public.orders (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_stripe_payment_intent_idx ON public.orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_checkouts_receipt_token_idx ON public.commerce_checkouts (receipt_token) WHERE receipt_token IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_checkouts_session_fingerprint_idx ON public.commerce_checkouts (session_fingerprint) WHERE session_fingerprint IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_email_idx ON public.profiles (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS membership_invoices_order_idx ON public.membership_invoices (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_bookmarks_post_idx ON public.community_bookmarks (post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_feed_posts_space_any_status_idx ON public.community_feed_posts (space_id) WHERE space_id IS NOT NULL;

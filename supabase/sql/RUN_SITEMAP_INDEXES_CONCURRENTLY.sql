-- ###########################################################################
--  STORELIB: THE INDEXES OF RUN-NOW PART 343, BUILT WITHOUT STOPPING WRITES
-- ###########################################################################
--
--  The same indexes as supabase/sql/run-now/343_sitemap_indexes.sql, with the
--  same names and definitions, built with CREATE INDEX CONCURRENTLY.
--
--  WHY. A plain CREATE INDEX takes a SHARE lock on its table: reads go on,
--  but every insert, update and delete waits until the index is built. The
--  SQL editor runs a paste as one transaction and keeps every lock until the
--  paste ends, so on a large products table part 343 would hold up every
--  product save for as long as the rest of the file takes. CONCURRENTLY
--  builds the index while writes continue.
--
--  HOW. CONCURRENTLY refuses to run inside a transaction, and the SQL editor
--  turns a paste of several statements into one. So:
--    - in the Supabase SQL editor, run ONE LINE AT A TIME: select a single
--      CREATE INDEX line below, press Run, wait for Success, then the next;
--    - or with psql, which runs each statement on its own:
--        psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/sql/RUN_SITEMAP_INDEXES_CONCURRENTLY.sql
--  Then run part 343 as usual. It finds every index already made and takes
--  no lock for it.
--
--  A LINE WHOSE TABLE OR COLUMN IS NOT THERE fails with "does not exist",
--  which changes nothing: skip it (part 343 skips it too, with a notice).
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

CREATE INDEX CONCURRENTLY IF NOT EXISTS products_sitemap_idx ON public.products (id) WHERE status = 'published';
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_sitemap_creator_idx ON public.products (creator_id, id) WHERE status = 'published';
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_theme_installs_sitemap_idx ON public.store_theme_installs (id) WHERE status = 'published';
CREATE INDEX CONCURRENTLY IF NOT EXISTS communities_sitemap_idx ON public.communities (id) WHERE status = 'published' AND deleted_at IS NULL;

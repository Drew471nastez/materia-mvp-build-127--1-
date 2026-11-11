-- HOW LONG A DELETE TAKES WHEN POSTGRES MUST SEARCH A TABLE FOR WHAT POINTS
-- AT THE ROW, BEFORE AND AFTER RUN-NOW PART 443 (scripts/sql-harness/delete-timing-443.sh).
--
-- psql -v phase=seed   fills every child table part 443 indexes (and a few
--                      parents) with :rows rows that point elsewhere: random
--                      ids, written with triggers and foreign key checks off,
--                      as a large shop's other customers would be. Then the
--                      rows the deletes below remove, which nothing points at.
-- psql -v phase=time   runs each delete and rolls it back, three times, and
--                      prints the best time. Nothing it deletes stays deleted.
--
-- Fake ids only, nothing from production. Run as supabase_admin.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- One row per call of the generator, for a table whose columns are not known
-- here: every NOT NULL column without a default gets a value of its type (the
-- first literal a CHECK names, for a text column that has one), and `fixed`
-- gives SQL expressions for the columns that matter. -1 and a notice when the
-- table refuses: that child is then left out of the timing, and said so.
CREATE OR REPLACE FUNCTION pg_temp.fill(t regclass, n integer, fixed jsonb) RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE cols text := ''; vals text := ''; r record; v text; chk text;
BEGIN
  FOR r IN SELECT a.attname, a.atttypid, format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull, (d.adbin IS NOT NULL) AS hasdef, a.attidentity, a.attgenerated, ty.typtype
           FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum JOIN pg_type ty ON ty.oid = a.atttypid
           WHERE a.attrelid = t AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LOOP
    IF fixed ? r.attname THEN
      v := fixed->>r.attname;
    ELSIF r.attnotnull AND NOT r.hasdef AND r.attidentity = '' AND r.attgenerated = '' THEN
      chk := NULL;
      SELECT substring(pg_get_constraintdef(c.oid) FROM '''([^'']*)''') INTO chk FROM pg_constraint c
        WHERE c.conrelid = t AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ~ ('\m' || r.attname || '\M') LIMIT 1;
      v := CASE
        WHEN r.typtype = 'e' THEN quote_literal((SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid = r.atttypid ORDER BY e.enumsortorder LIMIT 1)) || '::' || r.typ
        WHEN r.typ = 'uuid' THEN 'gen_random_uuid()'
        WHEN r.typ LIKE 'text%' OR r.typ LIKE 'character%' THEN coalesce(quote_literal(chk), 'md5(g::text || random()::text)')
        WHEN r.typ IN ('integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision') OR r.typ LIKE 'numeric%' THEN '1'
        WHEN r.typ = 'boolean' THEN 'false'
        WHEN r.typ IN ('jsonb', 'json') THEN '''{}'''
        WHEN r.typ LIKE 'timestamp%' THEN 'now()'
        WHEN r.typ = 'date' THEN 'current_date'
        WHEN r.typ LIKE '%[]' THEN '''{}'''
        ELSE NULL END;
      IF v IS NULL THEN RAISE NOTICE 'fill %: no value for % (%)', t, r.attname, r.typ; RETURN -1; END IF;
    ELSE
      CONTINUE;
    END IF;
    cols := cols || CASE WHEN cols = '' THEN '' ELSE ', ' END || quote_ident(r.attname);
    vals := vals || CASE WHEN vals = '' THEN '' ELSE ', ' END || v;
  END LOOP;
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM generate_series(1, %s) g', t, cols, vals, n);
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fill % refused: %', t, SQLERRM;
  RETURN -1;
END $f$;

-- One delete, rolled back, three times: the best of the three in ms.
CREATE OR REPLACE FUNCTION pg_temp.timed(q text) RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE t0 timestamptz; ms numeric; best numeric; i int;
BEGIN
  FOR i IN 1..3 LOOP
    BEGIN
      t0 := clock_timestamp();
      EXECUTE q;
      ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
      RAISE SQLSTATE 'RB443';
    EXCEPTION WHEN SQLSTATE 'RB443' THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'refused: %', SQLERRM; RETURN -1;
    END;
    best := least(coalesce(best, ms), ms);
  END LOOP;
  RETURN round(best, 1);
END $f$;

\if :{?phase}
\else
\set phase time
\endif
SELECT :'phase' = 'seed' AS seeding \gset
\if :seeding
SET session_replication_role = replica;
SELECT set_config('rel2.rows', :'rows', false);
CREATE TABLE IF NOT EXISTS public.rel2_timing_seeded (child text PRIMARY KEY, rows integer);
-- The children part 443 indexes, each pointing at ids nothing else has.
DO $seed$
DECLARE r record; n int; rows int := current_setting('rel2.rows')::int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('library_items', 'user_id'), ('community_comments', 'author_id'), ('notifications', 'actor_id'), ('community_poll_votes', 'user_id'),
    ('community_point_events', 'user_id'), ('community_member_days', 'user_id'), ('community_member_hours', 'user_id'), ('community_conversations', 'user_a'),
    ('community_invite_uses', 'user_id'), ('community_member_badges', 'user_id'), ('community_join_answers', 'user_id'), ('community_library_activity', 'user_id'),
    ('community_chat_automation_deliveries', 'user_id'), ('creator_contacts', 'user_id'), ('store_activity_log', 'actor_user_id'), ('site_versions', 'created_by'),
    ('entitlements', 'creator_id'), ('theme_publish_history', 'creator_id'), ('email_flow_jobs', 'creator_id'), ('membership_posts', 'creator_id'),
    ('review_drafts', 'creator_id'), ('inventory_reservations', 'creator_id'),
    ('theme_chat_reports', 'install_id'), ('store_theme_installs', 'parent_install_id'),
    ('flow_execution_log', 'product_id'), ('fulfilment_variant_links', 'product_id'), ('community_library_purchases', 'product_id'),
    ('product_bundles', 'variant_id'), ('inventory_transfer_items', 'variant_id'), ('course_progress', 'course_id'), ('course_enrollments', 'course_id'),
    ('refunds', 'order_id'), ('community_spaces', 'pinned_message_id'), ('inventory_movements', 'location_id'), ('orders', 'fulfillment_location_id')
  ) AS v(child, col) LOOP
    IF to_regclass('public.' || r.child) IS NULL OR EXISTS (SELECT 1 FROM public.rel2_timing_seeded s WHERE s.child = r.child || '.' || r.col) THEN CONTINUE; END IF;
    n := pg_temp.fill(('public.' || r.child)::regclass, rows, jsonb_build_object(r.col, 'gen_random_uuid()'));
    INSERT INTO public.rel2_timing_seeded VALUES (r.child || '.' || r.col, n);
  END LOOP;
END $seed$;
-- What the deletes remove: an account, a store, a website, 100 products with a variant and a course each, 100 orders, 200 chat messages, a stock location.
SELECT pg_temp.fill('auth.users', 1, '{"id": "''a4430000-0000-4000-8000-000000000001''"}');
SELECT pg_temp.fill('public.creators', 1, '{"id": "''c4430000-0000-4000-8000-000000000001''", "user_id": "''a4430000-0000-4000-8000-000000000001''", "slug": "''rel2-timing''"}');
SELECT pg_temp.fill('public.store_theme_installs', 1, '{"id": "''e4430000-0000-4000-8000-000000000001''", "creator_id": "''c4430000-0000-4000-8000-000000000001''"}');
SELECT pg_temp.fill('public.products', 100, '{"id": "(''a4431000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid", "creator_id": "''c4430000-0000-4000-8000-000000000001''", "slug": "''rel2-timing-'' || g"}');
SELECT pg_temp.fill('public.product_variants', 100, '{"id": "(''a4432000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid", "product_id": "(''a4431000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid"}');
SELECT pg_temp.fill('public.courses', 100, '{"id": "(''a4433000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid", "product_id": "(''a4431000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid", "creator_id": "''c4430000-0000-4000-8000-000000000001''"}');
SELECT pg_temp.fill('public.orders', 100, '{"id": "(''a4434000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid", "fulfillment_location_id": "NULL"}');
SELECT pg_temp.fill('public.community_messages', 200, '{"id": "(''a4435000-0000-4000-8000-'' || lpad(g::text, 12, ''0''))::uuid"}');
SELECT pg_temp.fill('public.inventory_locations', 1, '{"id": "''a4436000-0000-4000-8000-000000000001''", "creator_id": "''c4430000-0000-4000-8000-000000000001''"}');
SET session_replication_role = origin;
ANALYZE;
SELECT 'seeded ' || child || ' ' || rows FROM public.rel2_timing_seeded ORDER BY child;
\else
SELECT 'account deleted (auth.users) | ' || pg_temp.timed($q$DELETE FROM auth.users WHERE id = 'a4430000-0000-4000-8000-000000000001'$q$);
SELECT 'store deleted (creators) | ' || pg_temp.timed($q$DELETE FROM public.creators WHERE id = 'c4430000-0000-4000-8000-000000000001'$q$);
SELECT 'website deleted (store_theme_installs) | ' || pg_temp.timed($q$DELETE FROM public.store_theme_installs WHERE id = 'e4430000-0000-4000-8000-000000000001'$q$);
SELECT '100 products deleted, with variants and courses | ' || pg_temp.timed($q$DELETE FROM public.products WHERE id::text LIKE 'a4431000-%'$q$);
SELECT '100 orders deleted | ' || pg_temp.timed($q$DELETE FROM public.orders WHERE id::text LIKE 'a4434000-%'$q$);
SELECT '200 chat messages deleted, one at a time | ' || pg_temp.timed($q$DO $d$ DECLARE i int; BEGIN FOR i IN 1..200 LOOP DELETE FROM public.community_messages WHERE id = ('a4435000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid; END LOOP; END $d$$q$);
SELECT 'stock location deleted | ' || pg_temp.timed($q$DELETE FROM public.inventory_locations WHERE id = 'a4436000-0000-4000-8000-000000000001'$q$);
\endif

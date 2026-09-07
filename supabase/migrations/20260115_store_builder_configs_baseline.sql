-- ============================================================================
--  store_builder_configs / product_page_configs — the missing baseline
-- ============================================================================
--
--  WHY THIS FILE EXISTS, AND WHY ITS DATE IS EARLIER THAN THE DAY IT WAS
--  WRITTEN.
--
--  These two tables carry every creator page on the platform. About thirty
--  call sites read and write them. And until now NOTHING IN THIS REPOSITORY
--  CREATED THEM: they were made by hand in the Supabase dashboard, and the
--  migrations directory only ever contained changes layered on top —
--  20260225_performance_indexes adds an index to a table it never defines,
--  20260906 and 20260909 back-fill rows in a table they assume.
--
--  So the migrations ran fine against the one database that happened to have
--  been set up by hand, and failed on the first line against any other with
--
--      ERROR: relation "public.store_builder_configs" does not exist
--
--  The date is 20260115 because that is where this belongs in dependency
--  order — before 20260116_store_builder_images_bucket, and well before
--  anything that indexes or back-fills these tables. Ordering here is a
--  contract, not a changelog.
--
--  The shape below is reconstructed from the code that uses it:
--  app/api/store-builder/route.ts, lib/store-builder/*, and the marketing
--  routes that read published_config.
--
--  SAFE ON THE LIVE DATABASE. Every statement is IF NOT EXISTS, and the
--  security block at the end runs ONLY when this migration is the thing that
--  created the table — see the note there, which is the important one.
-- ============================================================================

-- ── the tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_builder_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- 'shop' is the creator page; 'product' is the default product template.
  page_type        TEXT NOT NULL,
  -- What the builder is editing.
  draft_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- What the public page renders. Never written except by Publish.
  published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_updated_at TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-product overrides of the product template.
CREATE TABLE IF NOT EXISTS public.product_page_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  draft_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_updated_at TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A database older than one of these columns gets it now rather than a
-- 42703 at runtime. Adding a nullable column is not a rewrite.
ALTER TABLE public.store_builder_configs
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.product_page_configs
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── one row per (creator, page) ─────────────────────────────────────────────
--
--  The code says `.eq(creator_id).eq(page_type).single()`. `single()` is an
--  ERROR on two rows, not a pick — a duplicate does not degrade the page, it
--  takes it down. So the uniqueness belongs in the database.
--
--  BUT: creating a unique index on a table that already holds duplicates
--  fails, and this migration must not be the thing that stops a live
--  deployment. So it is created only when the data already satisfies it, and
--  the duplicates are reported rather than resolved — deciding which of two
--  configs is the real one is a judgement call, not a migration.
DO $baseline_unique$
DECLARE
  dupes INTEGER;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.store_builder_configs
    GROUP BY creator_id, page_type HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING
      'store_builder_configs: % (creator_id, page_type) pair(s) have duplicate rows; unique index not created. Resolve them, then re-run this migration.',
      dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_sbc_creator_page
      ON public.store_builder_configs (creator_id, page_type);
  END IF;

  SELECT count(*) INTO dupes FROM (
    SELECT 1 FROM public.product_page_configs
    GROUP BY creator_id, product_id HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING
      'product_page_configs: % (creator_id, product_id) pair(s) have duplicate rows; unique index not created.',
      dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_ppc_creator_product
      ON public.product_page_configs (creator_id, product_id);
  END IF;
END;
$baseline_unique$;

CREATE INDEX IF NOT EXISTS idx_ppc_product ON public.product_page_configs (product_id);

-- ── security, and only on a database that did not already have these ────────
--
--  THIS IS THE PART THAT COULD BREAK A LIVE SITE, so it is fenced.
--
--  The production database configured RLS on these tables by hand, months
--  ago, and this file cannot see what those policies say. Running
--  ENABLE ROW LEVEL SECURITY against a table whose policies do not match
--  would take every creator page on the platform offline in one statement.
--
--  So: if the table already existed when this migration started, its
--  security configuration is left exactly as it is. What is set up below is
--  for a NEW environment — a fresh Supabase project, a staging clone, a
--  local stack — where there is nothing to break and no policy to guess at.
--
--  KNOWN GAP, stated rather than hidden: the public SELECT policy is
--  row-level, so a visitor who queries the table directly can also see
--  `draft_config` — a creator's unpublished layout. That matches how the app
--  reads today (the public routes select `published_config` by name, but RLS
--  cannot enforce that). Closing it properly means a published-only view and
--  a change at the read sites, which is a code change, not a baseline.
DO $baseline_rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['store_builder_configs', 'product_page_configs']
  LOOP
    -- No policies at all is the signal that this migration created the
    -- table. A hand-configured production table has policies already.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
        WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
    $p$, t || '_own', t);

    -- Anyone on the internet can read a creator page.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR SELECT TO anon, authenticated
        USING (published_config IS NOT NULL AND published_config <> '{}'::jsonb)
    $p$, t || '_public_read', t);

    -- RLS sits on top of GRANTs; without this the policy never gets asked.
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END;
$baseline_rls$;

-- ── updated_at ──────────────────────────────────────────────────────────────
--
--  Only if the shared trigger function exists. It is created by an earlier
--  hand-made object in production; a new environment that lacks it should
--  not fail here, because the app writes updated_at explicitly anyway.
DO $baseline_touch$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    RAISE NOTICE 'update_updated_at_column() not present; skipping updated_at triggers.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['store_builder_configs', 'product_page_configs']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_updated_at') THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t || '_updated_at', t);
    END IF;
  END LOOP;
END;
$baseline_touch$;

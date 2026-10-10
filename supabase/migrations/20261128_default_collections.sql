/* Part 108. Every store starts with two collections, as on Shopify: All products (smart, every product, newest first) and Home page (picked by hand). A server only table default_collections_given marks a store that has been given them, so a store that deletes them keeps them deleted, and every existing store with no collections at all gets the two now. Needs product_collections (part 78 or 95). Additive: nothing is dropped or renamed. Safe to run again. */
DO $$
BEGIN
  IF to_regclass('public.creators') IS NULL OR to_regclass('public.product_collections') IS NULL THEN
    RAISE NOTICE 'default collections: run part 95 (collections) first, nothing to do.';
    RETURN;
  END IF;
  CREATE TABLE IF NOT EXISTS public.default_collections_given (
    creator_id uuid PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE,
    given_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.default_collections_given ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.default_collections_given FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_collections_given TO service_role;

  INSERT INTO public.product_collections (creator_id, title, slug, description, kind, rules, match, sort, published)
  SELECT c.id, d.title, d.slug, d.description, d.kind, d.rules, 'all', d.sort, true
  FROM public.creators c
  CROSS JOIN (VALUES
    ('All products', 'all-products', 'Every product in the store.', 'smart', '[{"field":"price","op":"greater_than","value":"-1"}]'::jsonb, 'newest'),
    ('Home page', 'home-page', 'Products picked for the home page.', 'manual', '[]'::jsonb, 'manual')
  ) AS d(title, slug, description, kind, rules, sort)
  WHERE NOT EXISTS (SELECT 1 FROM public.default_collections_given g WHERE g.creator_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.product_collections pc WHERE pc.creator_id = c.id)
  ON CONFLICT (creator_id, slug) DO NOTHING;

  INSERT INTO public.default_collections_given (creator_id) SELECT c.id FROM public.creators c ON CONFLICT (creator_id) DO NOTHING;
END $$;

notify pgrst, 'reload schema';

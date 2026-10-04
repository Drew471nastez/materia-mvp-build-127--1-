/* Everything the Navigation page and collections need, in one file. store_menus holds the store's navigation menus once per store instead of inside each theme, so every theme shows the same ones and /app/website-builder/navigation can save them (the same table as part 93: if that was run, this part does nothing). product_collections and product_collection_items hold groups of products, by hand or by rules; they were made with the physical commerce tables, but collections now work for every kind of product, downloads, courses, memberships, services and physical goods alike, so a shop with physical commerce off needs these two tables and nothing else from that file (the same tables as part 78, so that too does nothing twice). Row level security is on everywhere: visitors (anon) are granted nothing, a signed in person reads their own collections, anybody signed in reads a published collection and the products in it, which is what /collections/<slug> needs, and only the server writes, through the owner checks in /api/collections and /api/website-builder/menus. Additive: nothing is dropped, nothing is renamed, no row is touched. Safe to run again. */

/* 1. The store's menus, shared by every theme */
CREATE TABLE IF NOT EXISTS public.store_menus (
  creator_id uuid PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE,
  menus jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_menus_is_object CHECK (jsonb_typeof(menus) = 'object'),
  CONSTRAINT store_menus_size CHECK (pg_column_size(menus) < 262144)
);
ALTER TABLE public.store_menus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_menus FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_menus TO service_role;

/* 2. Collections, for every kind of product */
CREATE TABLE IF NOT EXISTS public.product_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  description text CHECK (description IS NULL OR length(description) <= 5000),
  image_url text CHECK (image_url IS NULL OR length(image_url) <= 2048),
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'smart')),
  rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) <= 20),
  match text NOT NULL DEFAULT 'all' CHECK (match IN ('all', 'any')),
  sort text NOT NULL DEFAULT 'manual' CHECK (sort IN ('manual', 'newest', 'price_asc', 'price_desc', 'title', 'best_selling')),
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, slug)
);
CREATE TABLE IF NOT EXISTS public.product_collection_items (
  collection_id uuid NOT NULL REFERENCES public.product_collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS product_collection_items_product_idx ON public.product_collection_items (product_id);
/* A shop's published collections, which the storefront and the sitemap read together */
CREATE INDEX IF NOT EXISTS product_collections_creator_published_idx ON public.product_collections (creator_id, published);

/* 3. updated_at keeps itself current */
DO $do$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;
  END IF;
  DROP TRIGGER IF EXISTS product_collections_touch ON public.product_collections;
  CREATE TRIGGER product_collections_touch BEFORE UPDATE ON public.product_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
END $do$;

/* 4. Who can read what: the owner their own, anybody signed in a published collection, the server alone writes */
ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_collection_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_collections, public.product_collection_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_collections, public.product_collection_items FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_collections, public.product_collection_items TO service_role;
DO $do$ BEGIN DROP POLICY IF EXISTS "storelib owner reads product_collections" ON public.product_collections; CREATE POLICY "storelib owner reads product_collections" ON public.product_collections FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.creators c WHERE c.id = product_collections.creator_id AND c.user_id = (SELECT auth.uid()))); END $do$;
DO $do$ BEGIN DROP POLICY IF EXISTS "storelib reads published collections" ON public.product_collections; CREATE POLICY "storelib reads published collections" ON public.product_collections FOR SELECT TO authenticated USING (published); END $do$;
DO $do$ BEGIN DROP POLICY IF EXISTS "storelib reads published collection items" ON public.product_collection_items; CREATE POLICY "storelib reads published collection items" ON public.product_collection_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.product_collections pc WHERE pc.id = product_collection_items.collection_id AND (pc.published OR EXISTS (SELECT 1 FROM public.creators c WHERE c.id = pc.creator_id AND c.user_id = (SELECT auth.uid()))))); END $do$;

notify pgrst, 'reload schema';

/* 5. Did it work? Three rows, all saying true */
SELECT 'store_menus' AS table_name, to_regclass('public.store_menus') IS NOT NULL AS exists
UNION ALL SELECT 'product_collections', to_regclass('public.product_collections') IS NOT NULL
UNION ALL SELECT 'product_collection_items', to_regclass('public.product_collection_items') IS NOT NULL;

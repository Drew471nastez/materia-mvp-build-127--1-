-- Allow link imports to retain their platform identity. Existing Gumroad links are unchanged.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.product_import_links'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.product_import_links DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  ALTER TABLE public.product_import_links ADD CONSTRAINT product_import_links_source_check
    CHECK (source IN ('gumroad', 'shopify'));
END $$;
NOTIFY pgrst, 'reload schema';

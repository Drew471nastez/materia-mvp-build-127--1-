/* Part 469: product link imports keep their platform. The check on public.product_import_links.source now allows 'shopify' beside 'gumroad', so a Shopify product link import is recorded like a Gumroad one. Existing Gumroad links are unchanged. Run after part 344. Safe to run again. */
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
notify pgrst, 'reload schema';

/* Part 470: product link imports from Payhip. The check on public.product_import_links.source now allows 'payhip' beside 'gumroad' and 'shopify', so a Payhip product link import is recorded once per store like the others. Existing links are unchanged. Run after parts 344 and 469. Safe to run again. */
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
    CHECK (source IN ('gumroad', 'shopify', 'payhip'));
END $$;
notify pgrst, 'reload schema';

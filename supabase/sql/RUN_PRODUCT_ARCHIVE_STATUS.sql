-- ===========================================================================
--  Storelib: an archived product is off the page
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent: a second run changes
--  nothing.
--
--  Archive on the Products page used to set products.archived and leave the
--  status alone. Everything that shows or sells a product asks for
--  status = 'published', so a live product that was archived stayed on the
--  creator's page and in checkout, under a list that said it was off it.
--  Archive now sets status = 'archived' as well (lib/products/archive.ts).
--
--  This puts the products archived the old way where their creator meant
--  them to be: status 'archived', off every page. Restore on the Products
--  page brings one back as a draft. Products the flag does not mark are
--  not touched.
--
--  Needs 'archived' in products_status_check, which
--  supabase/migrations/20260926_admin_console.sql allows. If this fails
--  with a check violation, run that first.
-- ===========================================================================

update public.products
   set status = 'archived'
 where archived is true and status = 'published';

select count(*) as archived_but_published
  from public.products
 where archived is true and status = 'published';

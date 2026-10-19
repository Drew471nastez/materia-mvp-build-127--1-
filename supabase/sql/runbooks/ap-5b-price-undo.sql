-- ===========================================================================
--  STEP 5b (ONLY IF NEEDED): UNDO ONE BATCH FROM STEP 5
-- ===========================================================================
-- Put the batch name step 5 printed. Every field still at its corrected
-- value goes back; one the creator changed since is left as it is.
do $undo$
declare
  v_batch text := 'ao-YYYY-MM-DD-HHMMSS';   -- the batch name from step 5
  v_back int;
begin
  update public.products p set price_cents = c.before_cents
    from public.price_corrections c
   where c.batch = v_batch and c.applied_at is not null and c.undone_at is null
     and c.field = 'price_cents' and p.id = c.product_id and p.price_cents = c.after_cents;
  update public.products p set pwyw_min_price_cents = c.before_cents
    from public.price_corrections c
   where c.batch = v_batch and c.applied_at is not null and c.undone_at is null
     and c.field = 'pwyw_min_price_cents' and p.id = c.product_id and p.pwyw_min_price_cents = c.after_cents;
  update public.products p set pwyw_suggested_price_cents = c.before_cents
    from public.price_corrections c
   where c.batch = v_batch and c.applied_at is not null and c.undone_at is null
     and c.field = 'pwyw_suggested_price_cents' and p.id = c.product_id and p.pwyw_suggested_price_cents = c.after_cents;
  update public.products p set compare_at_cents = c.before_cents
    from public.price_corrections c
   where c.batch = v_batch and c.applied_at is not null and c.undone_at is null
     and c.field = 'compare_at_cents' and p.id = c.product_id and p.compare_at_cents = c.after_cents;

  update public.price_corrections c set undone_at = now()
    from public.products p
   where c.batch = v_batch and c.applied_at is not null and c.undone_at is null and c.product_id = p.id
     and case c.field when 'price_cents' then p.price_cents
                      when 'pwyw_min_price_cents' then p.pwyw_min_price_cents
                      when 'pwyw_suggested_price_cents' then p.pwyw_suggested_price_cents
                      when 'compare_at_cents' then p.compare_at_cents end = c.before_cents;
  get diagnostics v_back = row_count;
  raise notice 'Batch %: % field(s) put back.', v_batch, v_back;
end
$undo$;

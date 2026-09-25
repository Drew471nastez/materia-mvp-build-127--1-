/* Where an order came from (Storelib or a website) and the detail. Marks old basket orders as website. */
alter table public.orders add column if not exists source text;
alter table public.orders add column if not exists source_detail jsonb;
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source is null or source in ('storelib', 'website'));
update public.orders o set source = 'website' where o.source is null and o.stripe_session_id is not null and exists ( select 1 from public.orders other where other.stripe_session_id = o.stripe_session_id and other.id <> o.id );
notify pgrst, 'reload schema';

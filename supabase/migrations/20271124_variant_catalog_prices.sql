/* Read-only variant price facts for published products. A single Free variant is zero, never its product's old base price. Unavailable limited variants do not set a card's advertised price. No product/variant/order rows are changed. Original base prices remain intact for products with variants removed. Bounded to 500 requested products; no PII or file paths. */
create or replace function public.variant_catalog_prices(p_products uuid[])
returns table(id uuid,product_id uuid,name text,price_cents bigint,compare_at_price_cents bigint,pay_what_you_want boolean,pwyw_min_price_cents bigint,active boolean,available boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $f$
declare stock_check text := 'true';
begin
 if to_regclass('public.inventory_levels') is not null and to_regclass('public.inventory_locations') is not null then
 stock_check := $stock$ (v.product_type <> 'physical' or not coalesce((to_jsonb(v)->>'track_inventory')::boolean,v.product_tracks,true) or coalesce((to_jsonb(v)->>'inventory_policy')='continue',false) or v.product_continues or coalesce((select sum(greatest(l.available,0)) from public.inventory_levels l join public.inventory_locations loc on loc.id=l.location_id where l.variant_id=v.id and loc.creator_id=v.product_creator and loc.active and loc.fulfills_orders),0)>0) $stock$;
 end if;
 return query execute $query$
 with requested as(select unnest(($1::uuid[])[1:500]) as id),
 public_variants as (
 select v.*,coalesce((to_jsonb(v)->>'active')::boolean,true) and coalesce(v.name,'') not like 'Archived %' as is_live,
 coalesce(to_jsonb(p)->>'type','digital') as product_type,
 (to_jsonb(p)->>'creator_id')::uuid as product_creator,
 coalesce((to_jsonb(p)->>'track_inventory')::boolean,true) as product_tracks,
 coalesce((to_jsonb(p)->>'continue_selling')::boolean,false) as product_continues
 from public.product_variants v join public.products p on p.id=v.product_id
 where p.id in(select r.id from requested r) and p.status='published'
 and coalesce((to_jsonb(p)->>'archived')::boolean,false)=false
 ),
 sold as (
 select o.variant_id,count(*) as n from public.orders o
 where o.status='completed' and o.variant_id in(select v.id from public_variants v where coalesce(v.max_purchases,0)>0)
 group by o.variant_id
 )
 select v.id,v.product_id,v.name,v.price_cents::bigint,
 (to_jsonb(v)->>'compare_at_price_cents')::bigint,
 coalesce((to_jsonb(v)->>'pay_what_you_want')::boolean,false),
 (to_jsonb(v)->>'pwyw_min_price_cents')::bigint,v.is_live,
 v.is_live and (coalesce(v.max_purchases,0)<=0 or coalesce(s.n,0)<v.max_purchases) and ($query$ || stock_check || $query$)
 from public_variants v left join sold s on s.variant_id=v.id $query$ using p_products;
end;
$f$;
revoke all on function public.variant_catalog_prices(uuid[]) from public;
grant execute on function public.variant_catalog_prices(uuid[]) to anon,authenticated,service_role;
notify pgrst, 'reload schema';

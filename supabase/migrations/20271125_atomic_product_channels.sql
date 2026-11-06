/* Atomic product sales-channel settings. Creates only missing channel infrastructure, preserves all existing listings, and resolves channel keys inside one locked transaction. The server derives the creator from the authenticated caller. Only service_role may call the writer; anonymous visitors cannot read either table directly. Invalid keys roll the whole write back. Safe to run again. */
create table if not exists public.sales_channels(id uuid primary key default gen_random_uuid(),creator_id uuid not null references public.creators(id) on delete cascade,name text not null,description text,is_storefront boolean not null default false,enabled boolean not null default true,position integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.sales_channels add column if not exists kind text not null default 'custom';
update public.sales_channels set kind='storefront' where is_storefront and kind='custom';
create unique index if not exists sales_channels_one_of_kind on public.sales_channels(creator_id,kind) where kind<>'custom';
create table if not exists public.product_channel_listings(channel_id uuid not null references public.sales_channels(id) on delete cascade,product_id uuid not null references public.products(id) on delete cascade,creator_id uuid not null references public.creators(id) on delete cascade,listed boolean not null default true,updated_at timestamptz not null default now(),primary key(channel_id,product_id));
create index if not exists product_channel_listings_off_idx on public.product_channel_listings(creator_id,product_id) where not listed;
alter table public.sales_channels enable row level security;
alter table public.product_channel_listings enable row level security;
revoke all on public.sales_channels,public.product_channel_listings from public,anon;
revoke insert,update,delete on public.sales_channels,public.product_channel_listings from authenticated;
grant select on public.sales_channels,public.product_channel_listings to authenticated;
grant all on public.sales_channels,public.product_channel_listings to service_role;
DO $p$ BEGIN IF NOT EXISTS(select 1 from pg_policies where schemaname='public' and tablename='sales_channels' and policyname='sales_channels_owner_read') THEN CREATE POLICY sales_channels_owner_read ON public.sales_channels FOR SELECT TO authenticated USING(EXISTS(select 1 from public.creators c where c.id=creator_id and c.user_id=auth.uid())); END IF; IF NOT EXISTS(select 1 from pg_policies where schemaname='public' and tablename='product_channel_listings' and policyname='product_channel_listings_owner_read') THEN CREATE POLICY product_channel_listings_owner_read ON public.product_channel_listings FOR SELECT TO authenticated USING(EXISTS(select 1 from public.creators c where c.id=creator_id and c.user_id=auth.uid())); END IF; END $p$;
create or replace function public.set_product_channels_atomic(p_creator uuid,p_product uuid,p_off text[])
returns uuid[] language plpgsql security definer set search_path=public,pg_temp as $f$
declare channel_key text;channel uuid;kept uuid[]:='{}';channel_name text;
begin
 if p_off is null or coalesce(array_length(p_off,1),0)>64 then raise exception 'Invalid channel selection' using errcode='22023';end if;
 perform 1 from public.products where id=p_product and creator_id=p_creator for update;
 if not found then raise exception 'Product not found' using errcode='P0002';end if;
 foreach channel_key in array p_off loop
  channel:=null;
  if channel_key in('storefront','creator_page','marketplace') then
   channel_name:=case channel_key when 'storefront' then 'Online store' when 'creator_page' then 'Creator page' else 'Marketplace' end;
   insert into public.sales_channels(creator_id,kind,name,is_storefront,enabled,position) values(p_creator,channel_key,channel_name,channel_key='storefront',true,case channel_key when 'storefront' then 0 when 'creator_page' then 1 else 2 end) on conflict(creator_id,kind) where kind<>'custom' do nothing;
   select id into channel from public.sales_channels where creator_id=p_creator and kind=channel_key;
  elsif channel_key~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select id into channel from public.sales_channels where id=channel_key::uuid and creator_id=p_creator;
  end if;
  if channel is null then raise exception 'Unknown sales channel' using errcode='22023';end if;
  if not channel=any(kept) then kept:=array_append(kept,channel);end if;
 end loop;
 delete from public.product_channel_listings where creator_id=p_creator and product_id=p_product and not(channel_id=any(kept));
 insert into public.product_channel_listings(channel_id,product_id,creator_id,listed,updated_at) select k,p_product,p_creator,false,now() from unnest(kept) k on conflict(channel_id,product_id) do update set listed=false,updated_at=excluded.updated_at;
 return kept;
end;
$f$;
revoke all on function public.set_product_channels_atomic(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.set_product_channels_atomic(uuid,uuid,text[]) to service_role;
notify pgrst, 'reload schema';

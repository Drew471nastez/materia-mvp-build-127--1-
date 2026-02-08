-- Payout currency + descriptor normalization (safe to re-run)
alter table if exists creators
  add column if not exists payout_currency text not null default 'USD';

alter table if exists creators
  drop constraint if exists creators_payout_currency_check;

alter table if exists creators
  add constraint creators_payout_currency_check
  check (payout_currency in ('USD','EUR','GBP','CAD','AUD','JPY','CHF','SEK','NOK','NZD'));

update creators
set default_currency = 'USD'
where default_currency is distinct from 'USD';

update creators
set payout_currency = case
  when upper(coalesce(default_currency, 'USD')) in ('USD','EUR','GBP','CAD','AUD','JPY','CHF','SEK','NOK','NZD') then upper(default_currency)
  else 'USD'
end
where payout_currency is null or payout_currency not in ('USD','EUR','GBP','CAD','AUD','JPY','CHF','SEK','NOK','NZD');

update creators
set statement_descriptor = 'STORELIB*'
where coalesce(statement_descriptor, '') <> 'STORELIB*';

-- --------------------------------------------------------------------
-- USER PURCHASE/WISHLIST DIAGNOSTICS (UUID-safe)
-- Replace USER_UUID_HERE or leave as-is to return 0 counts safely.
-- This avoids: invalid input syntax for type uuid: "USER_UUID_HERE"
-- --------------------------------------------------------------------
with input as (
  select
    case
      when trim('USER_UUID_HERE') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim('USER_UUID_HERE')::uuid
      else null
    end as user_id
)
select count(distinct e.product_id) as entitlement_digital_count
from entitlements e
join products p on p.id = e.product_id
cross join input i
where e.buyer_id = i.user_id
  and p.type = 'digital';

with input as (
  select
    case
      when trim('USER_UUID_HERE') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim('USER_UUID_HERE')::uuid
      else null
    end as user_id
)
select count(distinct o.product_id) as completed_order_digital_count
from orders o
join products p on p.id = o.product_id
cross join input i
where o.buyer_id = i.user_id
  and o.status = 'completed'
  and p.type = 'digital';

with input as (
  select
    case
      when trim('USER_UUID_HERE') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim('USER_UUID_HERE')::uuid
      else null
    end as user_id
)
select count(*) as wishlist_count
from wishlist_items w
cross join input i
where w.user_id = i.user_id;

-- Lock buyer-facing currency to USD and add internal payout currency controls
-- Ready to copy/paste and run.

alter table if exists creators
  add column if not exists payout_currency text not null default 'USD';

alter table if exists creators
  drop constraint if exists creators_payout_currency_check;

alter table if exists creators
  add constraint creators_payout_currency_check
  check (payout_currency in ('USD','EUR','GBP'));

update creators
set default_currency = 'USD'
where default_currency is distinct from 'USD';

update creators
set payout_currency = case
  when upper(coalesce(default_currency, 'USD')) in ('USD','EUR','GBP') then upper(default_currency)
  else 'USD'
end
where payout_currency is null or payout_currency not in ('USD','EUR','GBP');

update creators
set statement_descriptor = 'STORELIB*'
where coalesce(statement_descriptor, '') <> 'STORELIB*';

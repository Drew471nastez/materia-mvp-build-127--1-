-- ===========================================================================
--  STEP 1 (DATABASE SIDE): CREATORS WHOSE PAYOUTS MAY BE BLOCKED (READ ONLY)
-- ===========================================================================
-- Stripe pays out across borders only between the US, UK, EEA, Canada and
-- Switzerland, and never to a recipient-agreement account. Before round AP,
-- every creator outside Romania was opened on the recipient agreement first,
-- so "cross-border" below almost certainly means recipient (the Stripe audit
-- script confirms each one). "outside region" can never be paid from Romania.
with region(cc) as (values ('US'),('GB'),('CA'),('CH'),('AT'),('BE'),('BG'),('HR'),('CY'),('CZ'),('DK'),('EE'),('FI'),('FR'),('DE'),('GR'),('HU'),('IE'),('IT'),('LV'),('LT'),('LU'),('MT'),('NL'),('PL'),('PT'),('RO'),('SK'),('SI'),('ES'),('SE'),('IS'),('LI'),('NO'))
select c.slug, c.display_name, upper(c.stripe_account_country) as country,
       case when upper(c.stripe_account_country) = 'RO' then 'domestic: fine'
            when upper(c.stripe_account_country) in (select cc from region) then 'cross-border: likely recipient, check in Stripe'
            when c.stripe_account_country is null then 'country unknown: open their payments page once to sync'
            else 'outside region: Stripe cannot pay out from Romania' end as payout_status,
       c.payouts_enabled,
       (select count(*) from public.orders o where o.creator_id = c.id and o.status in ('completed', 'refunded')) as paid_orders
  from public.creators c
 where c.stripe_account_id is not null
 order by (upper(coalesce(c.stripe_account_country, '')) = 'RO'), paid_orders desc;

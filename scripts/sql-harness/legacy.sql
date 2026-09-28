-- THE OLDEST SHAPES SOME PARTS UPGRADE, and the rows some parts skip for.
-- Applied on a copy of the base by run.sh's legacy scenario, as postgres,
-- before the two files run twice. Each block names the part that has to cope.

-- PART 46: "the oldest shape of this table named the address recipient_email
-- and required it" (supabase/migrations/20260202_email_flows_system.sql):
-- no email, no creator_id, a flow_id, recipient_email NOT NULL. One row in it.
drop table if exists public.email_events cascade;
create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  flow_id uuid references public.email_flows(id) on delete cascade,
  recipient_email text not null,
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
insert into public.email_events (recipient_email, event_type) values ('fan@example.com', 'sent');

-- PART 51: "the live email_flows table carries a check on trigger_type or
-- status that no file in this repository made", from before the First order
-- and Leaves checkout triggers. Names nobody knows, older values, one row.
alter table public.email_flows add constraint flows_trigger_ok check (trigger_type in ('new_subscriber', 'purchase', 'tag_added', 'manual'));
alter table public.email_flows add constraint flows_status_ok check (status in ('draft', 'active'));
insert into public.email_flows (creator_id, name, trigger_type, status) values ('00000000-0000-4000-b000-000000000001', 'Welcome', 'new_subscriber', 'active');

-- PART 03 skips itself when the old webhook recorded one refund twice.
insert into public.ledger_events (creator_id, event_type, amount_cents, currency, order_id, stripe_refund_id, description)
select '00000000-0000-4000-b000-000000000001', 'refund', -1500, 'usd', '00000000-0000-4000-d000-000000000001', 're_twice', 'Refund recorded twice' from generate_series(1, 2);

-- PART 48 skips itself when a buyer already has two reviews of one product.
insert into public.reviews (product_id, creator_id, buyer_id, rating, content) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 4, 'Second review by the same buyer');

-- PART 54 skips itself when two OnePages share an address in different case.
insert into public.onepages (owner_id, slug, title, status) values ('00000000-0000-4000-a000-000000000003', 'marapop', 'Ioana', 'draft');

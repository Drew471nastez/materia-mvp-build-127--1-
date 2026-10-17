# Everything still to run, in four files

Every database change the app is waiting on, in four files for the Supabase SQL
editor. Written for the last fortnight and checked against the whole
repository, so nothing any session shipped is left out.

That is every part in `supabase/sql/run-now/` (01 to 221, then the storage
policies and the check). Part 45 is the older one: three changes from 18 to 22
September, in the website builder's agent, that this list never carried. Every
other part was written 24 to 27 September.

The same SQL also sits in `supabase/sql/run-four/` and
`supabase/sql/all-last-three-days/`, under the names it was first asked for.
Run one folder, not three: running the same part twice changes nothing, so no
harm either way.

All three folders are written by `python3 scripts/build-run-four.py` from
`run-now/`, part by part, text unchanged, so they cannot drift apart. Do not
edit these files by hand.

## How to run them

1. Open `1_of_4_core.sql`, select all, copy.
2. In the SQL editor open a new query tab, paste, press Run. If the editor asks
   whether to run a query with destructive operations, say yes: the only drops
   are of old policies and constraints that the same file puts back.
3. Wait for the one row that says `Storelib file 1 of 4 ran. Next file.`
4. Do the same with `2_of_4_...`, `3_of_4_...`, then `4_of_4_...`.

The last file ends with one row of true or false, one column per part. Every
column should read true.

Each file runs as one transaction. If Run shows an error, nothing in that file
changed: stop there and send the error. Every statement checks before it
changes anything, so running a file again, or running parts you already ran
from `run-now/`, changes nothing.

## What is in each file

- **1 of 4** rate limits, newsletter, agent connections and GitHub, refunds
  recorded once, event and email types, order source, site speed, website
  addresses, coupons and the admin console, email automations.
- **2 of 4** agent MCP, library limit and privacy, checkout contacts, product
  bundles, upload safety, storage buckets, private digital files, storage
  cleanup, variant policies.
- **3 of 4** saved cards, bounces and `exec_sql` closed, email sending, domains
  for a website or a creator page, browser notifications and time zone, Ask
  Storelib conversations and pictures, Analytics speed, business accounts,
  creator badges, Ask Storelib reports, notification rules, website accounts
  and contact forms, discount code holds, orders kept with their creator,
  customer accounts on websites, product variant columns, company details on
  orders, a creator's own AI keys, up to three businesses on one login, the
  notification engine and its admin counts, receipt email records made server
  only, a deleted product leaving the OnePage that named it, one home for a
  creator's name and photo, and the website builder agent's document and
  questions.
- **4 of 4** the `storage.objects` policies, then the check row.

## What they change in rows you already have

- `05`: basket orders from before the order source existed are marked as
  website orders.
- `08`: products archived the old way get the status `archived`.
- `27`: gives lucadragoste the Veteran badge.
- `32`: writes each order's creator into its new `creator_id` column, from the
  order's product. From then on deleting a product keeps its orders (with no
  product) instead of deleting them.
- `44`: the copies of a creator's name and photo that still hold the old value
  are set to what the profile says now.

Nothing else touches existing rows. Nothing deletes data.

## Before file 3, on a busy store

File 3 builds the indexes Analytics reads (part 25). Building an index takes a
lock, so new visit tracking waits while it builds. Count the rows first:

```sql
select count(*) from public.analytics_events;
```

Under about 100k rows it is quick, so run file 3 as it is. Past that, create
those indexes first, one statement at a time, each in its own query tab:
`CREATE INDEX CONCURRENTLY` cannot run inside a transaction, which is why they
are not written that way in the file. The six are listed in
`supabase/sql/run-now/25_analytics_speed.sql`; add `CONCURRENTLY` after
`CREATE INDEX`. File 3 then finds them already there and moves on.

## If a column in the last row reads false

- `p90_storage_policies`: the SQL editor's role does not own `storage.objects`
  on this project, so file 4 left the storage policies as they were and said so
  in a notice instead of failing. Uploads keep working on the policies you have
  now. To replace them, follow Route 1 in `supabase/sql/run-now/README.md`, or
  ask Supabase support to run
  `supabase/sql/run-now/90_storage_policies_needs_owner.sql` as the storage
  owner.
- `p03_refund_once`: the same Stripe refund was recorded twice on an order, so
  that index was skipped with a warning. Nothing else depends on it. Send the
  result of the query in the warning (also in `run-now/README.md`) before
  changing any ledger row.
- Anything else: send a screenshot of the row.

## What is deliberately not here

`00_check_first.sql` in `run-now/` is the audit: read only, it names everything
the app needs, whether it is there, and which file creates what is missing. It
lists a few tables (`library_items`, `onepages`, `generate_onepage_slug`) that
no file in the repository creates. They were made before the repository kept
its SQL, they are in the database already, and nothing here touches them.

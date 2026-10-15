# The whole database update in four files

Everything the app is waiting on from the last three weeks, in four files for
the Supabase SQL editor. They hold every part in `supabase/sql/run-now/`
(01 to 186, then the storage policies and the check), text unchanged, so there
is one list and nothing to pick out by hand.

## How to run them

1. Open `1_of_4_core.sql`, select all, copy.
2. In the SQL editor open a new query tab, paste, press Run. If the editor asks
   whether to run a query with destructive operations, say yes: the only drops
   are of old policies and constraints that the same file puts back, and the
   one per login key on business links that part 38 replaces with a trigger.
3. Wait for the one row that says `Storelib file 1 of 4 ran. Next file.`
4. Do the same with `2_of_4_…`, `3_of_4_…`, then `4_of_4_…`.

The last file ends with one row of true or false, one column per part. Every
column should read true.

Each file runs as one transaction. If Run shows an error, nothing in that file
changed: stop there and send the error. Every statement checks before it
changes anything, so running a file again, or running parts you already ran
from `run-now/`, changes nothing.

## What they change in rows you already have

- `05`: basket orders from before the order source existed are marked as
  website orders.
- `08`: products archived the old way get the status `archived`.
- `27`: gives lucadragoste the Veteran badge.
- `32`: writes each order's creator into its new `creator_id` column, from the
  order's product. From then on deleting a product keeps its orders (with no
  product) instead of deleting them.

Nothing else touches existing rows. Nothing deletes data.

## If a column in the last row reads false

- `p90_storage_policies`: the SQL editor's role does not own `storage.objects`
  on this project, so file 4 left the storage policies as they were and said so
  in a notice instead of failing. Your uploads keep working on the policies you
  have now. To replace them, follow Route 1 in `supabase/sql/run-now/README.md`
  (seven policies made in Storage > Policies), or ask Supabase support to run
  `supabase/sql/run-now/90_storage_policies_needs_owner.sql` as the storage
  owner.
- `p03_refund_once`: the same Stripe refund was recorded twice on an order, so
  that index was skipped with a warning. Nothing else depends on it. Send the
  result of the query in the warning (also in `run-now/README.md`) before
  changing any ledger row.
- Anything else: send a screenshot of the row.

## Checked before shipping

On Postgres 16 set up like Supabase (the editor's role owns `public`, bypasses
row security, and does not own `storage.objects` unless granted), each file was
sent whole, as the editor sends it, twice:

- on a database missing every part: no errors, every column true;
- on a database where parts 01 to 21 had already been run from `run-now/`: no
  errors, every column true;
- on a database where everything had already been run: no errors, nothing
  changed;
- with a role that does not own `storage.objects`: file 4 skipped the policies
  with a notice, no error, only `p90_storage_policies` false;
- with the same refund recorded twice: file 1 skipped that one index with a
  warning, no error, only `p03_refund_once` false.

After the four files, `run-now/00_check_first.sql` (the list of every table,
column, function, policy and bucket the app's code names, 846 of them) finds
nothing missing.

Three objects the app uses are not in any file because they were made in the
dashboard long ago and already exist: the `onepages` and `library_items`
tables and the `generate_onepage_slug` function.

## Rebuilding

The files are generated. After adding or changing a part in `run-now/`, run
`python3 scripts/build-run-four.py`. A part numbered 20 to 89 goes into file 3
by itself.

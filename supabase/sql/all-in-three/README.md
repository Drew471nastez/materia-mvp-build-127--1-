# Everything still to run, in three files

The same SQL as `all-last-14-days/` and `run-four/`, in three files instead of
four: every part in `supabase/sql/run-now/` (01 to 63), then the storage
policies and the check. Run one folder, not several: a part that already ran
changes nothing the second time.

Written by `python3 scripts/build-run-four.py` from `run-now/`, part by part,
text unchanged. Do not edit these files by hand.

## How to run them

1. Open `1_of_3_core_library_checkout.sql`, select all, copy.
2. In the Supabase SQL editor open a new query tab, paste, press Run. If it
   asks about destructive operations, say yes: the only drops are old policies
   and constraints the same file puts straight back.
3. Wait for the row that says `Storelib file 1 of 3 ran. Next file.`
4. Do the same with `2_of_3_latest.sql`, then `3_of_3_storage_policies_and_check.sql`.

The last file ends with one row of true or false, one column per part. Every
column should read true. Two can be false for a reason that is not a problem:
`p90_storage_policies` (the editor's role does not own the storage table, so
your upload policies were left as they are) and `p03_refund_once` (the same
refund was once recorded twice). Anything else, send a screenshot of the row.

Each file runs as one transaction: if Run shows an error, nothing in that file
changed. Stop there and send the error.

## Before file 2, on a busy store

File 2 builds the indexes Analytics reads (part 25). Run
`select count(*) from public.analytics_events;` first. Under about 100k rows,
run it as it is. Above that, create the six indexes in
`run-now/25_analytics_speed.sql` one at a time with `CREATE INDEX CONCURRENTLY`
first; file 2 then finds them and moves on.

## What is new since the four files were first handed over

- `45` the website builder agent's document and questions.
- `46` email automations completed.
- `47` archived products kept consistent.
- `48` one review per buyer.
- `49` the payouts table. The Stripe webhook, Cash out and Withdraw have been
  writing payouts into a table production never had, so those writes failed
  quietly.
- `50` sign up protection (`profiles.spam_state`), which the admin console
  reads.

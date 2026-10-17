# SQL updates in the admin console

Open `/admin/sql-updates` after signing in to the Storelib admin console.
The catalog is regenerated from `supabase/sql/run-now/*.sql` during every
development startup and production build. Do not edit its generated JSON.

The database's `storelib_applied_parts` table is the execution record:

- Recorded as applied: file name and SHA-256 match this deployment.
- No execution record: no matching ledger key. This is not proof of never running.
- Changed since execution: the stored file or hash differs. Review the change.
- History unavailable: history could not be read, including a missing ledger.
- Separate review: owner-only storage SQL, diagnostic checks, or manual payment setup.

The page checks history every 15 seconds while visible and on focus. It does
not subscribe browsers to this private, service-role-only table. New source
SQL appears when the deployment containing it goes live. Source dates come
from the latest Git commit touching each file, or say unavailable without
Git history. These dates are not execution dates.

Select updates and use **Copy full SQL** or **Download SQL**. Timeframe and
search filters do not resolve dependencies: inspect earlier unrecorded parts
and changed files before running a subset. Review the complete SQL before
pasting it into the Supabase SQL editor. Batches preserve source text, order
by part number, bootstrap the existing part 67 ledger, and record hashes
after the SQL executes in one transaction. A transaction-level advisory lock
serializes batches made by this page. Lock acquisition is bounded to five
seconds and statements to two minutes. Large maintenance operations may need
separate review and a deliberate timeout change. If a statement fails, roll
back; do not continue the transaction manually or mark the file applied.
Copying, downloading, and selecting never write to the ledger or database.

Separate-review files are exported individually, unchanged, without an
automatic ledger entry. In particular, storage ownership cannot be inferred
from a skipped operation. Historical copies under migrations, generated
bundles, and production schema snapshots must not be treated as additional
pending updates. Two canonical files have prefix 91; their full stems are
used as separate identifiers to avoid corrupting attribution.
Part 61's historical page-view backfill is also kept separate, so a large
analytics update does not hold locks acquired by checkout migrations.

There is intentionally no arbitrary remote SQL runner, no new database RPC,
and no browser-accessible service key. Storelib previously closed generic
`exec_sql` access. This page does not reopen it. A historical manual execution
cannot be reconstructed exactly from today's schema; do not manufacture ledger
entries based on schema guesses. Recorded execution is not a guarantee that
another later change has not altered the schema.

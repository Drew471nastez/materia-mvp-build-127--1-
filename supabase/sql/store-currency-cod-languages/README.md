# Store currency, cash on delivery and languages

The database side of the overhaul, in three files. Each is pasted into a new
query tab in the Supabase SQL editor and run on its own.

| File | What it does |
| --- | --- |
| `1_run.sql` | Run-now parts 174 (cash on delivery), 175 (translate changes automatically) and 176 (a store's own selling currency), text unchanged, after a check that the tables they build on exist. One transaction; safe to run again. Built by `python3 scripts/build-currency-cod-languages-sql.py`. |
| `2_check.sql` | Read only. One row per thing the code needs, each `true`; then what stores sell in and the latest currency changes. |
| `3_rollback.sql` | How to undo part 176: put converted prices back first, then the code, then drop the schema. |

The same parts are in `run-now/`, `run-four/` and `all-in-two/`. Run one route
or the other; running both is harmless.

## What part 176 adds

- `store_settings.currency`: the store's selling currency, a three letter code,
  or empty for the platform's (every store until it chooses).
- `store_currency_changes`: each change, once per request key, with the rate
  and its day, what was counted, and whether it was undone.
- `store_currency_snapshots`: every value a conversion changed, as it was.
- `store_change_currency(...)`: the change, in one locked transaction. "keep"
  moves no number; "convert" converts every price the store owns at the rate
  the merchant was shown. It refuses when the store's currency moved
  underneath it, and returns the first result for a repeated key.
- `store_currency_restore(store, change)`: the latest change put back exactly.

Both tables have row level security on and no grants to `anon` or
`authenticated`; the functions run for `service_role` only.

Cash on delivery's countries, fee and note, and the Languages list, need no
schema: they are in `store_settings.checkout` and `store_localization`.

## Irreversible

Nothing in `1_run.sql` deletes or rewrites existing data. A merchant who
converts prices changes them, and Undo (or `store_currency_restore`) puts them
back while the snapshots exist. `3_rollback.sql` deletes the history and the
snapshots: after it, a conversion can no longer be undone. Orders, refunds,
invoices and payouts are never touched by any of these files.

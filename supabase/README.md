# The database: where its truth lives

One page for anyone about to change the database, or wondering which of the
many SQL files is the real one.

## The short answer

| Question | Answer |
| --- | --- |
| What does production look like right now? | `supabase/schema/`, written from the live database every night (`.github/workflows/schema-drift.yml`). When production changes, a pull request called "The live database changed" shows exactly what. |
| What has production run? | The database says so itself: `public.storelib_applied_parts`, one row per part (run-now part 67). The admin's Health view, "Database updates", names any part not run, or changed since it ran. |
| Where does a change go? | A new part in `supabase/sql/run-now/`. That folder is the only place a change is written. |
| How does it reach production? | `python3 scripts/build-run-four.py`, then the owner runs the files in `supabase/sql/run-four/` (or `all-in-three/`) in the Supabase SQL editor. Each part records itself as it runs. |

Everything else is history, kept because it is how the database got here:

| Folder | What it is | Run it? |
| --- | --- | --- |
| `supabase/sql/run-now/` | Every change since run-now began, one numbered part each, one statement per line. **The source.** | Through the built files |
| `supabase/sql/run-four/`, `all-in-three/`, `all-last-three-days/`, `all-last-14-days/` | Built from run-now by `scripts/build-run-four.py`, identical content in different groupings. Never edited by hand. | Yes, in order |
| `supabase/migrations/` | Readable copies. Parts from 62 on are byte for byte their run-now part; earlier ones are the multi line originals the parts were made from. | No |
| `supabase/sql/RUN_*.sql`, `scripts/*.sql`, `sql/` | What was run before run-now existed. Already applied to production. | No. Kept as history; some tests read them. |
| `supabase/schema/` | Production, as it is. Written by the nightly job, never by hand. | No |

## Adding a change

1. Write `supabase/sql/run-now/NN_what_it_does.sql`, NN one above the highest:
   - line 1 is a `/* ... */` summary in plain words: what changes, why, what
     happens before it has run, and "Safe to run again";
   - then one statement per line (a `DO $do$ ... $do$;` block on one line),
     no `--` comments;
   - every statement safe to run twice (`IF NOT EXISTS`, `CREATE OR REPLACE`,
     `DROP ... IF EXISTS` before `CREATE`, guards on `to_regclass`);
   - last line `notify pgrst, 'reload schema';`.
2. Copy it, byte for byte, to `supabase/migrations/<yyyymmdd>_what_it_does.sql`.
3. Add its row to `supabase/sql/run-now/README.md` (what it does, lines, bytes).
4. Add its column to `supabase/sql/run-now/99_check_after.sql`: `... as pNN_what_it_does`, true when it holds.
5. Adding a column to `creators` or `profiles`? End the part with
   `SELECT public.storelib_share_public_columns();` so visitors can read it, or
   put the column on the private list in the same part if nobody else may
   (`public.storelib_private_columns`, and `lib/security/public-columns.ts`).
6. `python3 scripts/build-run-four.py` and `pnpm test:push`.
7. Prove it on a real Postgres before it reaches production: the part, run
   twice, on a scratch database (`initdb`, or the `postgres:17` image), with
   the attack or the failure it prevents shown before and after.

The code works before the part has run and after: a missing table or
function (`42P01`, `42703`, `PGRST202`, `PGRST205`) is the "before" path, never
an error page.

## Why it is like this

The database was changed by hand in the SQL editor for a long time, from four
different folders, and nothing recorded what ran. The code grew workarounds
for columns that "may not exist in every database", and old access rules from
early scripts were still live years of commits later. The record (part 67),
the nightly snapshot and the one folder are what stop that from happening again.

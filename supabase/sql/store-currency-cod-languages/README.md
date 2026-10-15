# Store currency, cash on delivery and languages

The database side of the overhaul, in three files. Each is pasted into a new
query tab in the Supabase SQL editor and run on its own.

| File | What it does |
| --- | --- |
| `1_run.sql` | Run-now parts 174 (cash on delivery), 175 (translate changes automatically), 176 (a store's own selling currency), 177 (translating in the background), 178 (translation memory) and 179 (changes translated within minutes of a publish), text unchanged, after a check that the tables they build on exist. One transaction; safe to run again. Built by `python3 scripts/build-currency-cod-languages-sql.py`. |
| `2_check.sql` | Read only. One row per thing the code needs, each `true`; then what stores sell in, the background translations, the translation memory and the latest currency changes. |
| `3_rollback.sql` | How to undo parts 176 and 177: put converted prices back first, then the code, then drop the schema. |

The same parts are in `run-now/`, `run-four/` and `all-in-two/`. Run one route
or the other; running both is harmless.

## What part 179 adds

- `store_localization.translate_dirty_at`: written when a store with Translate
  changes automatically on publishes its website or saves a menu, a product or
  a collection. `/api/cron/translation-jobs` (every three minutes) translates
  the stores whose last change is a couple of minutes old and clears it once
  they are up to date, so a change is live in its other languages within
  minutes, not hours. The hourly `/api/cron/translations` only queues a store
  nothing has queued for a day.
- `store_localization.translate_lease_until`: one run translates a store at a
  time. Without part 179 the hourly run works through the stores as before.

## What part 178 adds

- `translation_memory`: every run of words an open translation model
  (LibreTranslate, or Hugging Face's opus-mt and NLLB) has translated, by
  language pair and the sha256 of the words, kept for good. The same words are
  never sent twice, for any store. Server only. Without it everything still
  translates, just without the cache.

## What part 177 adds

- `store_translation_jobs`: one row per store and language while Storelib AI
  translates the website in the background, with how many texts are
  translated out of all of them, done or failed and why. A run holds a job by
  its lease, so two never translate the same language; one cut off is picked
  up by `/api/cron/translation-jobs` (every three minutes). Server only.
  Without it, Settings translates round by round from the page, as before.

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

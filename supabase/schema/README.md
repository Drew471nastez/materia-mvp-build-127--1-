# Production's structure

Written from the live database by `scripts/db/snapshot-schema.sh`, every night,
by `.github/workflows/schema-drift.yml`. Never edited by hand. When production
changes, the workflow opens a pull request with the new files, so the diff is
the change. Empty until the `SUPABASE_DB_URL` secret is set in GitHub.

- `public.sql`: every table, column, index, function, trigger, policy and grant in `public`.
- `storage-policies.tsv`: the row level rules on `storage.objects`.

See `supabase/README.md`.

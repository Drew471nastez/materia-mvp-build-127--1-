# Backups and restoring

Everything Storelib holds, where copies of it live, and how to get any of it
back. Written to be followed at 3am by someone who has never restored anything.

## What is kept, in layers

| Layer | What | How far back | Where | Undo size |
| --- | --- | --- | --- | --- |
| 1. Deleted rows | Every row deleted from the tables that hold work and money (products, files, variants, courses, orders, library, refunds, payouts, balance and history, plans, invoices, creators, profiles, OnePages, store and website settings and pages, domains, discount codes, email lists and flows, reviews) | 90 days | `public.deleted_rows`, in the database (run-now part 66) | One row |
| 2. Supabase backups | The whole database | Daily for 7 days on Pro; to the second with the Point in Time Recovery add-on | Supabase | Whole database |
| 3. Off-site database copy | The whole database, auth included, encrypted | Every night, kept as long as the bucket's lifecycle rule says (90 days suggested) | Your own bucket outside Supabase (Cloudflare R2 suggested) | Whole database or any table |
| 4. Off-site file copy | Every file in every storage bucket: product files, images, videos, site assets | Every night; a deleted or replaced file is kept under `storage/changed/<date>/` (180 days suggested) | The same bucket | One file or a whole bucket |
| 5. Restore drill | Proof that layer 3 restores, every table's rows counted | Weekly | GitHub Actions | |

Supabase's own backups (layer 2) do not include uploaded files. Layer 4 is the
only copy of those outside Supabase.

What else keeps things from being lost in the first place:

- A product with sales is archived, never deleted (lib/products/delete-product.ts).
- Deleting an account retires it when anyone bought from it: buyers keep what
  they bought and every money record stays (lib/account/delete-account.ts).
- Website themes keep their own publish history and backups (Website builder, Backups).
- Every change to a seller's balance is written once, with its history row, in
  one locked step (lib/payments/ledger.ts).

## One time setup (the owner does this once)

1. **Supabase plan.** Pro keeps 7 daily backups. Add **Point in Time Recovery**
   (Project Settings, Add-ons) to restore to any second of the last 7 days.
   Without it a bad hour means going back to last night.
2. **A bucket outside Supabase.** Cloudflare R2 is cheapest (no download fees):
   Cloudflare dashboard, R2, Create bucket `storelib-backups`. Under the
   bucket's Settings add lifecycle rules: delete `db/` objects after 90 days,
   `storage/changed/` after 180 days. Never `storage/current/`. Make an R2 API
   token with Object Read and Write on that bucket only. Note the access key
   id, the secret, and the endpoint `https://<account id>.r2.cloudflarestorage.com`.
3. **Supabase Storage S3 keys.** Supabase, Project Settings, Storage, S3
   Connection: turn it on, note the endpoint and region, and create an access
   key (id and secret).
4. **A backup passphrase.** `openssl rand -base64 48`. Store it in your password
   manager AND on paper. Without it no backup can be read, by anyone, including you.
5. **GitHub secrets.** The repository, Settings, Secrets and variables, Actions, New repository secret:

   | Secret | Value |
   | --- | --- |
   | `SUPABASE_DB_URL` | Supabase, Connect, Session pooler connection string, with the database password |
   | `BACKUP_PASSPHRASE` | from step 4 |
   | `BACKUP_S3_BUCKET` | `storelib-backups` |
   | `BACKUP_S3_ENDPOINT` | the R2 endpoint |
   | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | the R2 token |
   | `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION` | from step 3 |
   | `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | from step 3 |
   | `ALERT_WEBHOOK_URL` | optional: a Slack or Discord incoming webhook for failures |

6. **Run it once by hand.** GitHub, Actions, Nightly backup, Run workflow. Then
   Actions, Weekly restore drill, Run workflow. Both green means it works.
   After that they run on their own (backup 02:17 UTC every night, drill Sunday
   05:41 UTC) and GitHub emails you when one fails.

## Restoring

### A row somebody deleted (a product, an order, a page): layer 1

Supabase, SQL Editor:

```sql
select id, table_name, row_id, deleted_at, deleted_by, row_data->>'title' as title
from public.deleted_rows
where table_name = 'products' and deleted_at > now() - interval '7 days'
order by deleted_at desc;

select public.storelib_restore_deleted_row(123);   -- the id from above
```

It answers `true` when the row is back, `false` when a row with that id exists
already. Rows deleted together share a `tx`: restore parents first (a creator
before its products, a product before its files, a website's
`store_theme_installs` row before its `store_theme_pages`, `store_theme_settings`
and `store_theme_custom_files`, which part 466 keeps).

### The whole database to a moment before something went wrong: layer 2

Supabase, Database, Backups. With Point in Time Recovery pick the second
before it happened; without it, the last daily backup. This replaces the live
database: every write after that moment is gone, so note the time first and
put the site in maintenance if you can.

### From the off-site copy (Supabase itself lost or unusable): layer 3

On any machine with Postgres 17 client tools and the AWS CLI:

```bash
export BACKUP_PASSPHRASE='...' AWS_ACCESS_KEY_ID='...' AWS_SECRET_ACCESS_KEY='...'
export AWS_ENDPOINT_URL='https://<account>.r2.cloudflarestorage.com'
aws s3 cp s3://storelib-backups/db/LATEST - --endpoint-url $AWS_ENDPOINT_URL   # which one is newest
aws s3 cp s3://storelib-backups/db/2026/10/01/storelib-2026-10-01T021700Z.dump.gpg backup.dump.gpg --endpoint-url $AWS_ENDPOINT_URL
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d -o backup.dump backup.dump.gpg
# Into a NEW Supabase project (its connection string, not production's):
pg_restore --no-owner --dbname "postgresql://postgres:<password>@<new project host>:5432/postgres" backup.dump
```

Supabase's own schemas already exist in a new project, so some "already
exists" messages are expected. Then point `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel at the
new project and redeploy. One table only: `pg_restore --data-only --table=products ...`
into a scratch database, then copy the rows you need.

### Files: layer 4

```bash
# every file of a bucket, as it was last night
rclone copy dest:storelib-backups/storage/current/digital-products supa:digital-products
# one file deleted or replaced on a given day
rclone copy dest:storelib-backups/storage/changed/2026-10-01/product-images/<path> supa:product-images/<folder>
```

(The same `RCLONE_CONFIG_SUPA_*` and `RCLONE_CONFIG_DEST_*` settings as
scripts/backup/backup-storage.sh.)

## Targets

- Losing at most: a second with Point in Time Recovery, else one day (database); one day (files).
- Back up within: an hour for a row or a file, a few hours for the whole database.

## Where the pieces are

- `supabase/sql/run-now/66_deleted_rows_kept.sql`: layer 1. `466_website_pages_deleted_rows_kept.sql` adds a website's pages, theme settings and code files to it.
- `scripts/backup/backup-database.sh`, `backup-storage.sh`, `restore-drill.sh`, `common.sh`: layers 3 to 5. Each runs locally too (`BACKUP_DEST=file:///some/folder`).
- `.github/workflows/backup.yml`, `.github/workflows/restore-drill.yml`: the schedules.
- `app/api/cron/storage-cleanup`: forgets deleted row copies older than 90 days.
- `tests/backups.test.ts`: keeps all of the above in place.

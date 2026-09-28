#!/usr/bin/env bash
# Storelib's nightly off-site database backup. docs/operations/backups.md is the runbook.
#
# Dumps the whole database (every schema Storelib uses, auth included) with
# pg_dump's custom format, writes a manifest of row counts for the tables
# that matter, encrypts both with a passphrase only the owner holds, and
# uploads them to storage that is not Supabase (Cloudflare R2, Backblaze B2,
# S3: anything that speaks S3), under db/YYYY/MM/DD/.
#
# Needs:
#   SUPABASE_DB_URL      the database connection string (Supabase, Project Settings, Database, "Session pooler" or direct)
#   BACKUP_PASSPHRASE    a long random passphrase; without it a backup cannot be read, so keep it outside Supabase and GitHub too
#   BACKUP_DEST          s3://bucket/prefix for real backups, or file:///path for a local test
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL   for an S3 destination (R2: https://<account>.r2.cloudflarestorage.com)
# Optional:
#   PG_BIN               folder holding pg_dump and psql of the server's major version or newer
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
: "${BACKUP_DEST:?BACKUP_DEST is not set}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/common.sh
source "$here/common.sh"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
day_path="db/$(date -u +%Y/%m/%d)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

log "dumping the database"
"$(pg_tool pg_dump)" "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner \
  --exclude-schema='_analytics' --exclude-schema='_realtime' --exclude-schema='supabase_functions' \
  --exclude-table-data='public.rate_limit_hits' \
  --file="$work/storelib-$stamp.dump"

log "counting the rows that matter"
row_counts "$SUPABASE_DB_URL" > "$work/storelib-$stamp.manifest.tsv"
sha256sum "$work/storelib-$stamp.dump" | awk '{print "sha256\t" $1}' >> "$work/storelib-$stamp.manifest.tsv"
bytes="$(wc -c < "$work/storelib-$stamp.dump" | tr -d ' ')"
printf 'bytes\t%s\ncreated\t%s\n' "$bytes" "$stamp" >> "$work/storelib-$stamp.manifest.tsv"
if [ "$bytes" -lt 10000 ]; then
  fail "the dump is only $bytes bytes, which is not a whole database"
fi

log "encrypting"
for f in "$work/storelib-$stamp.dump" "$work/storelib-$stamp.manifest.tsv"; do
  encrypt "$f" "$f.gpg"
done

log "uploading to $(redact "$BACKUP_DEST")/$day_path"
put "$work/storelib-$stamp.dump.gpg" "$day_path/storelib-$stamp.dump.gpg"
put "$work/storelib-$stamp.manifest.tsv.gpg" "$day_path/storelib-$stamp.manifest.tsv.gpg"
# The pointer the restore drill and a person restoring read first.
printf '%s/storelib-%s\n' "$day_path" "$stamp" > "$work/LATEST"
put "$work/LATEST" "db/LATEST"

log "done: $bytes bytes, $(grep -c $'\t' "$work/storelib-$stamp.manifest.tsv") manifest lines"

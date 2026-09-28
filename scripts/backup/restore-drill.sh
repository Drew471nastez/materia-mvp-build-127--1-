#!/usr/bin/env bash
# Proves the newest off-site backup can be restored. docs/operations/backups.md.
#
# Fetches the backup db/LATEST points at, checks its checksum, decrypts it,
# restores it into an EMPTY Postgres (DRILL_DB_URL, a throwaway database,
# never production), and compares every key table's row count with the
# manifest written when the backup was made. Any difference fails the drill.
# A backup that has never been restored is a hope, not a backup.
#
# Needs BACKUP_PASSPHRASE, BACKUP_DEST (and the S3 variables for s3://), and
# DRILL_DB_URL. Refuses to run against a database that already has tables.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
: "${BACKUP_DEST:?BACKUP_DEST is not set}"
: "${DRILL_DB_URL:?DRILL_DB_URL is not set}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/common.sh
source "$here/common.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
psql_drill() { "$(pg_tool psql)" "$DRILL_DB_URL" -XAtq -v ON_ERROR_STOP=1 "$@"; }

existing="$(psql_drill -c "select count(*) from pg_tables where schemaname = 'public'")"
[ "$existing" = "0" ] || fail "DRILL_DB_URL already has $existing tables in public; the drill only restores into an empty database"

get "db/LATEST" "$work/LATEST"
base="$(tr -d '\n' < "$work/LATEST")"
log "restoring $base"
get "$base.dump.gpg" "$work/backup.dump.gpg"
get "$base.manifest.tsv.gpg" "$work/manifest.tsv.gpg"
decrypt "$work/backup.dump.gpg" "$work/backup.dump" || fail "the backup could not be decrypted: a wrong BACKUP_PASSPHRASE, or the file was damaged"
decrypt "$work/manifest.tsv.gpg" "$work/manifest.tsv" || fail "the manifest could not be decrypted"

want_sum="$(awk -F'\t' '$1=="sha256"{print $2}' "$work/manifest.tsv")"
have_sum="$(sha256sum "$work/backup.dump" | awk '{print $1}')"
[ -n "$want_sum" ] && [ "$want_sum" = "$have_sum" ] || fail "checksum differs: the backup is damaged"
created="$(awk -F'\t' '$1=="created"{print $2}' "$work/manifest.tsv")"
log "checksum matches; made $created"

# The roles Supabase's policies and grants name, so they restore as written.
for role in anon authenticated service_role authenticator supabase_admin supabase_auth_admin supabase_storage_admin dashboard_user pgbouncer supabase_replication_admin supabase_read_only_user; do
  psql_drill -c "do \$\$ begin create role $role nologin; exception when duplicate_object then null; end \$\$" >/dev/null
done

set +e
"$(pg_tool pg_restore)" --no-owner --dbname="$DRILL_DB_URL" "$work/backup.dump" 2> "$work/restore.log"
set -e
errors="$(grep -c 'error:' "$work/restore.log" || true)"
log "restored with $errors statement errors (objects of Supabase extensions a plain Postgres does not have; tables and rows are what is checked)"

mismatch=0
checked=0
while IFS=$'\t' read -r table want; do
  case "$table" in sha256|bytes|created|"") continue ;; esac
  if [ "$table" = "auth.users" ]; then q="select count(*) from auth.users"; else q="select count(*) from public.$table"; fi
  have="$(psql_drill -c "$q" 2>/dev/null || echo missing)"
  checked=$((checked + 1))
  if [ "$have" != "$want" ]; then
    log "MISMATCH $table: backup says $want, restored $have"
    mismatch=$((mismatch + 1))
  fi
done < "$work/manifest.tsv"

[ "$checked" -gt 0 ] || fail "the manifest named no tables"
[ "$mismatch" -eq 0 ] || fail "$mismatch of $checked tables did not restore whole"
log "drill passed: $checked tables restored with every row, backup made $created"

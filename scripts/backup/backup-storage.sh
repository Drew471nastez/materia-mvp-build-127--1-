#!/usr/bin/env bash
# Storelib's nightly off-site copy of every uploaded file. docs/operations/backups.md.
#
# Supabase's own backups hold the database only: product files, images,
# videos and site assets live in Supabase Storage and are in none of them.
# This mirrors every bucket to storage outside Supabase with rclone, over
# Supabase Storage's S3 connection.
#
# NOTHING IS EVER LOST FROM THE COPY. A file deleted or overwritten in
# Supabase is not deleted from the backup: rclone moves the old version to
# storage/changed/<date>/<bucket>/ before the mirror under storage/current/
# changes, and those dated folders are kept for as long as the destination
# bucket's lifecycle rule says (180 days in the runbook).
#
# Needs rclone and, for the two ends:
#   SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY
#     (Supabase, Project Settings, Storage, S3 connection; make an access key there)
#   BACKUP_S3_BUCKET, AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (the destination, the same one the database backup uses)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/common.sh
source "$here/common.sh"

for v in SUPABASE_S3_ENDPOINT SUPABASE_S3_ACCESS_KEY_ID SUPABASE_S3_SECRET_ACCESS_KEY BACKUP_S3_BUCKET AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || fail "$v is not set"
done
command -v rclone >/dev/null || fail "rclone is not installed"

export RCLONE_CONFIG_SUPA_TYPE=s3
export RCLONE_CONFIG_SUPA_PROVIDER=Other
export RCLONE_CONFIG_SUPA_ENDPOINT="$SUPABASE_S3_ENDPOINT"
export RCLONE_CONFIG_SUPA_REGION="${SUPABASE_S3_REGION:-us-east-1}"
export RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_SUPA_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_DEST_TYPE=s3
export RCLONE_CONFIG_DEST_PROVIDER=Other
export RCLONE_CONFIG_DEST_ENDPOINT="$AWS_ENDPOINT_URL"
export RCLONE_CONFIG_DEST_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID"
export RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_DEST_NO_CHECK_BUCKET=true

day="$(date -u +%Y-%m-%d)"
buckets="$(rclone lsf --dirs-only supa: | sed 's#/$##')"
[ -n "$buckets" ] || fail "no buckets listed: check the Supabase S3 keys"

failed=0
for b in $buckets; do
  log "mirroring $b"
  if ! rclone sync "supa:$b" "dest:$BACKUP_S3_BUCKET/storage/current/$b" \
      --backup-dir "dest:$BACKUP_S3_BUCKET/storage/changed/$day/$b" \
      --fast-list --transfers 16 --checkers 32 --retries 5 --low-level-retries 20 --stats-one-line --stats 60s; then
    log "bucket $b did not finish"
    failed=$((failed + 1))
  fi
done
[ "$failed" -eq 0 ] || fail "$failed bucket(s) did not finish"
log "every bucket mirrored"

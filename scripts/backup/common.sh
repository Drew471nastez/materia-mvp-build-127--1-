#!/usr/bin/env bash
# Shared by the backup scripts in this folder. docs/operations/backups.md.

log() { printf '[backup %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
fail() { log "FAILED: $*"; exit 1; }

# A connection string or key with its secret parts hidden, for the log.
redact() { printf '%s' "$1" | sed -E 's#(://)[^@/]*@#\1***@#; s#(password=)[^& ]*#\1***#g'; }

# pg_dump, pg_restore or psql: from PG_BIN when set, else the newest installed, else PATH.
pg_tool() {
  local name="$1"
  if [ -n "${PG_BIN:-}" ] && [ -x "$PG_BIN/$name" ]; then printf '%s' "$PG_BIN/$name"; return; fi
  local newest
  newest="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$newest" ] && [ -x "$newest/$name" ]; then printf '%s' "$newest/$name"; return; fi
  command -v "$name" || fail "$name is not installed"
}

# The tables whose rows are the business: products, money, people, sites.
KEY_TABLES="products digital_assets orders entitlements refunds payouts ledger_events seller_ledger creators profiles subscribers onepages store_theme_installs sites site_files custom_domains reviews coupons invoices subscriptions"

# table<TAB>rows for every key table this database has, plus auth.users.
row_counts() {
  local url="$1" t
  for t in $KEY_TABLES; do
    "$(pg_tool psql)" "$url" -XAtq -v ON_ERROR_STOP=1 -c "select case when to_regclass('public.$t') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.$t', false, true, '')))[1]::text end" \
      | awk -v t="$t" 'NF { print t "\t" $0 }'
  done
  "$(pg_tool psql)" "$url" -XAtq -c "select 'auth.users' || E'\t' || count(*) from auth.users" 2>/dev/null || true
}

encrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 --output "$2" "$1"; }
decrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --decrypt --output "$2" "$1"; }

# put LOCAL REMOTE_PATH / get REMOTE_PATH LOCAL, against BACKUP_DEST (s3://bucket/prefix or file:///dir).
put() {
  case "$BACKUP_DEST" in
    file://*) local dir="${BACKUP_DEST#file://}"; mkdir -p "$dir/$(dirname "$2")"; cp "$1" "$dir/$2" ;;
    s3://*) aws s3 cp --only-show-errors "$1" "${BACKUP_DEST%/}/$2" ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"} ;;
    *) fail "BACKUP_DEST must start with s3:// or file://" ;;
  esac
}
get() {
  case "$BACKUP_DEST" in
    file://*) cp "${BACKUP_DEST#file://}/$1" "$2" ;;
    s3://*) aws s3 cp --only-show-errors "${BACKUP_DEST%/}/$1" "$2" ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"} ;;
    *) fail "BACKUP_DEST must start with s3:// or file://" ;;
  esac
}

#!/usr/bin/env bash
# Writes the LIVE database's structure into the repository, so the repository
# always shows what production actually is. supabase/README.md explains why.
#
#   supabase/schema/public.sql            every table, column, index, function,
#                                         trigger, policy and grant in public
#   supabase/schema/storage-policies.tsv  the row level rules on storage.objects
#
# Structure only: no rows, no secrets. The output is normalised (no dump
# timestamps or version banners), so it only changes when the database does.
#
# Needs SUPABASE_DB_URL; PG_BIN optionally, for a pg_dump as new as the server.
set -euo pipefail
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/backup/common.sh
source "$root/scripts/backup/common.sh"
out="$root/supabase/schema"
mkdir -p "$out"

"$(pg_tool pg_dump)" "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner \
  | grep -v -E '^-- (Dumped (from|by)|Started on|Completed on)|^SET |^SELECT pg_catalog\.set_config|^\\(un)?restrict ' \
  | cat -s > "$out/public.sql.tmp"
[ -s "$out/public.sql.tmp" ] || fail "the dump was empty"
mv "$out/public.sql.tmp" "$out/public.sql"

"$(pg_tool psql)" "$SUPABASE_DB_URL" -XAtq -F $'\t' -v ON_ERROR_STOP=1 -c "
  select policyname, cmd, array_to_string(roles, ','), coalesce(qual, ''), coalesce(with_check, '')
  from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname" > "$out/storage-policies.tsv"

log "schema written: $(grep -c '^CREATE TABLE' "$out/public.sql") tables, $(grep -c '^CREATE POLICY' "$out/public.sql") policies, $(wc -l < "$out/storage-policies.tsv" | tr -d ' ') storage rules"

#!/usr/bin/env bash
# PART 477 (WHO IS ON STORELIB NOW, ROUND 62), RUN ON A REAL POSTGRES.
#
# Uses the production-shaped database scripts/check-business-limit-sql.sh
# builds (Supabase's roles and auth schema, the base files, the seed, then
# all-in-two/1_of_2): starts it when it is not running, builds the template
# `limit_base` when it is missing, makes a fresh copy, runs
# supabase/sql/run-now/477_platform_live.sql twice (it must be safe to run
# again), then scripts/sql-harness/platform-live.sql.
#
# Needs root, /usr/lib/postgresql/16/bin and psql. Prints ok or FAIL per line;
# exits 1 on any FAIL. Env: LIMIT_PGDATA, LIMIT_PORT as that script.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
part="$root/supabase/sql/run-now/477_platform_live.sql"
bin=/usr/lib/postgresql/16/bin
pgdata="${LIMIT_PGDATA:-/var/lib/postgresql/business-limit}"
port="${LIMIT_PORT:-55491}"
logs="$(mktemp -d)"; chmod 777 "$logs"
export PGHOST="$pgdata" PGPORT="$port"
as_admin() { psql -X -q -U supabase_admin "$@"; }
as_editor() { psql -X -q -U postgres "$@"; }
if ! as_admin -d postgres -Atc "select 1 from pg_database where datname = 'limit_base'" 2>/dev/null | grep -q 1; then
  bash "$root/scripts/check-business-limit-sql.sh" >/dev/null 2>&1
fi
as_admin -d postgres -c "drop database if exists live_run" -c "create database live_run template limit_base" >/dev/null 2>&1 || { echo "FAIL could not copy limit_base"; exit 1; }
for i in 1 2; do
  as_editor -d live_run -1 -v ON_ERROR_STOP=1 -f "$part" >/dev/null 2>"$logs/part-$i.txt" && echo "ok   the part runs (run $i)" || { echo "FAIL the part (run $i)"; head -20 "$logs/part-$i.txt"; exit 1; }
done
as_admin -d live_run -f "$root/scripts/sql-harness/platform-live.sql" > "$logs/out.txt" 2>&1
sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //' "$logs/out.txt" | grep -E '^ *(ok|FAIL)|ERROR' | sed 's/^ *//'
grep -q 'FAIL\|ERROR' "$logs/out.txt" && exit 1
exit 0

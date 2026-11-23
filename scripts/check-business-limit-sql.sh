#!/usr/bin/env bash
# PART 446 (A LOGIN'S BUSINESS LIMIT, PER ACCOUNT), RUN ON A REAL POSTGRES.
#
# Builds a database shaped like production the way scripts/check-business-
# handoff-sql.sh does (Supabase's roles and auth schema, the base files, the
# seed, then all-in-two/1_of_2, which holds parts 39 and 376), runs
# supabase/sql/run-now/446_business_limit_per_account.sql twice (it must be
# safe to run again), then scripts/sql-harness/business-limit.sql: three a
# login with no row, no limit with -1, a number of its own, back to the rule
# with NULL, the handoff counting to the same number, and who can read or
# write the limit as anon, a signed in user and the service role. Also runs
# the part on a database without part 376's function (it must skip that step).
#
# Needs root, /usr/lib/postgresql/16/bin and psql. Prints ok or FAIL per line;
# exits 1 on any FAIL. Env: LIMIT_PGDATA (default /var/lib/postgresql/
# business-limit), LIMIT_PORT (default 55491), REBUILD=1 to build the base again.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
here="$root/scripts/sql-harness"
part="$root/supabase/sql/run-now/446_business_limit_per_account.sql"
bin=/usr/lib/postgresql/16/bin
pgdata="${LIMIT_PGDATA:-/var/lib/postgresql/business-limit}"
port="${LIMIT_PORT:-55491}"
logs="$(mktemp -d)"; chmod 777 "$logs"
export PGHOST="$pgdata" PGPORT="$port"
as_admin() { psql -X -q -U supabase_admin "$@"; }
as_editor() { psql -X -q -U postgres "$@"; }
if [ ! -f "$pgdata/PG_VERSION" ]; then
  mkdir -p "$pgdata" && chown postgres:postgres "$pgdata"
  su postgres -c "$bin/initdb -D '$pgdata' -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null || exit 1
fi
if ! su postgres -c "$bin/pg_ctl -D '$pgdata' status" >/dev/null 2>&1; then
  su postgres -c "$bin/pg_ctl -D '$pgdata' -o '-p $port -k $pgdata' -l '$pgdata/server.log' -w start" >/dev/null || exit 1
fi
if [ "${REBUILD:-0}" = 1 ] || ! as_admin -d postgres -Atc "select 1 from pg_database where datname = 'limit_base'" | grep -q 1; then
  as_admin -d postgres -c "drop database if exists limit_base" -c "create database limit_base" >/dev/null || exit 1
  as_admin -d limit_base -v ON_ERROR_STOP=1 -f "$here/supabase-shim.sql" >/dev/null 2>"$logs/shim.txt" || { cat "$logs/shim.txt"; exit 1; }
  as_admin -d limit_base -c "grant supabase_storage_admin to postgres" >/dev/null 2>&1
  while IFS= read -r f; do
    case "$f" in ''|'#'*) continue;; esac
    as_editor -d limit_base -f "$root/$f" >/dev/null 2>>"$logs/base-errors.txt"
  done < "$here/base-files.txt"
  as_editor -d limit_base -v ON_ERROR_STOP=1 -f "$here/seed.sql" >/dev/null 2>"$logs/seed.txt" || { cat "$logs/seed.txt"; exit 1; }
  as_admin -d limit_base -c "revoke supabase_storage_admin from postgres" >/dev/null
  as_editor -d limit_base -1 -v ON_ERROR_STOP=1 -f "$root/supabase/sql/all-in-two/1_of_2_everything.sql" >/dev/null 2>"$logs/all.txt" || { grep ERROR "$logs/all.txt" | head; exit 1; }
fi
as_admin -d postgres -c "drop database if exists limit_run" -c "create database limit_run template limit_base" >/dev/null 2>&1 || exit 1
for i in 1 2; do
  as_editor -d limit_run -1 -v ON_ERROR_STOP=1 -f "$part" >/dev/null 2>"$logs/part-$i.txt" && echo "ok   the part runs (run $i)" || { echo "FAIL the part (run $i)"; head -20 "$logs/part-$i.txt"; exit 1; }
done
as_editor -d limit_run -v ON_ERROR_STOP=1 -f "$here/business-limit.sql" > "$logs/out.txt" 2>&1
rc=$?
sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //' "$logs/out.txt" | grep -E '^ *(ok|FAIL)|ERROR' | sed 's/^ *//'
# Without part 376's function: the part skips the handoff step and does the rest.
as_admin -d postgres -c "drop database if exists limit_no376" -c "create database limit_no376 template limit_base" >/dev/null 2>&1 || exit 1
as_admin -d limit_no376 -c "drop function public.business_handoff_accept(uuid, text, uuid, text, text, text, text)" >/dev/null || exit 1
as_editor -d limit_no376 -1 -v ON_ERROR_STOP=1 -f "$part" >/dev/null 2>"$logs/no376.txt" && echo "ok   the part runs where part 376 never ran" || { echo "FAIL the part without 376"; head "$logs/no376.txt"; rc=1; }
grep -q 'FAIL\|ERROR' "$logs/out.txt" && exit 1
exit $rc

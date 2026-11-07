#!/usr/bin/env bash
# THE HANDOFF'S SQL, RUN ON A REAL POSTGRES (not Storelib's database).
#
# Builds a database shaped like production the way scripts/sql-harness/run.sh
# does (Supabase's roles and auth schema from supabase-shim.sql, the base
# files, seed.sql, then every run-now part through all-in-two/1_of_2), runs
# supabase/migrations/20271131_business_handoff.sql twice (it must be safe to
# run again), then scripts/sql-harness/business-handoff.sql: every refusal of
# business_handoff_accept by its word, a refusal after the link moved rolling
# everything back, a real handoff (the link moved, the founder's other
# business left alone, products and ids unchanged, payouts released with the
# old account kept, the team cleared and the founder added back with the
# preset, devices and AI keys gone, the link used once), and who can read or
# call what as anon, a stranger and the business itself.
#
# Needs root, /usr/lib/postgresql/16/bin and psql. Prints ok or FAIL per line;
# exits 1 on any FAIL. Env: HANDOFF_PGDATA (default /var/lib/postgresql/handoff),
# HANDOFF_PORT (default 55471), REBUILD=1 to build the base again.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
here="$root/scripts/sql-harness"
bin=/usr/lib/postgresql/16/bin
pgdata="${HANDOFF_PGDATA:-/var/lib/postgresql/handoff}"
port="${HANDOFF_PORT:-55471}"
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
if [ "${REBUILD:-0}" = 1 ] || ! as_admin -d postgres -Atc "select 1 from pg_database where datname = 'handoff_base'" | grep -q 1; then
  as_admin -d postgres -c "drop database if exists handoff_base" -c "create database handoff_base" >/dev/null || exit 1
  as_admin -d handoff_base -v ON_ERROR_STOP=1 -f "$here/supabase-shim.sql" >/dev/null 2>"$logs/shim.txt" || { cat "$logs/shim.txt"; exit 1; }
  as_admin -d handoff_base -c "grant supabase_storage_admin to postgres" >/dev/null 2>&1
  while IFS= read -r f; do
    case "$f" in ''|'#'*) continue;; esac
    as_editor -d handoff_base -f "$root/$f" >/dev/null 2>>"$logs/base-errors.txt"
  done < "$here/base-files.txt"
  as_editor -d handoff_base -v ON_ERROR_STOP=1 -f "$here/seed.sql" >/dev/null 2>"$logs/seed.txt" || { cat "$logs/seed.txt"; exit 1; }
  as_admin -d handoff_base -c "revoke supabase_storage_admin from postgres" >/dev/null
  as_editor -d handoff_base -1 -v ON_ERROR_STOP=1 -f "$root/supabase/sql/all-in-two/1_of_2_everything.sql" >/dev/null 2>"$logs/all.txt" || { grep ERROR "$logs/all.txt" | head; exit 1; }
fi
as_admin -d postgres -c "drop database if exists handoff_run" -c "create database handoff_run template handoff_base" >/dev/null 2>&1 || exit 1
for i in 1 2; do
  as_editor -d handoff_run -1 -v ON_ERROR_STOP=1 -f "$root/supabase/migrations/20271131_business_handoff.sql" >/dev/null 2>"$logs/part-$i.txt" && echo "ok   the part runs (run $i)" || { echo "FAIL the part (run $i)"; head -20 "$logs/part-$i.txt"; exit 1; }
done
as_editor -d handoff_run -v ON_ERROR_STOP=1 -f "$here/business-handoff.sql" > "$logs/out.txt" 2>&1
rc=$?
sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //' "$logs/out.txt" | grep -E '^ *(ok|FAIL)|ERROR' | sed 's/^ *//'
grep -q 'FAIL\|ERROR' "$logs/out.txt" && exit 1
exit $rc

#!/usr/bin/env bash
# DELETE TIMINGS BEFORE AND AFTER RUN-NOW PART 443, on a copy of a database
# the harness built (scripts/sql-harness/run.sh editor leaves harness_editor_wire:
# the base with both files run twice, which is production before part 443).
#
#   HARNESS_PGDATA=... HARNESS_PORT=... ROWS=100000 bash scripts/sql-harness/delete-timing-443.sh [source_db]
#
# Seeds every child table part 443 indexes with ROWS rows (delete-timing-443.sql),
# times each delete with the part not run, runs the part, times them again,
# runs it a second time and shows that no index of its was made twice. On a
# copy where part 443 already ran, its indexes are dropped first.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
export PGHOST="${HARNESS_PGDATA:-/var/lib/postgresql/sqlharness}" PGPORT="${HARNESS_PORT:-55432}"
src="${1:-harness_editor_wire}"
db=harness_timing_443
rows="${ROWS:-100000}"
part="$root/supabase/sql/run-now/443_database_load_round_two.sql"
PGOPTIONS="-c client_min_messages=warning" psql -X -q -U supabase_admin -d postgres -c "drop database if exists $db" -c "create database $db template $src" || exit 1
# The state before the part, also on a copy where it already ran: its indexes dropped.
grep -o 'CREATE INDEX IF NOT EXISTS [a-z_0-9]*' "$part" | awk '{print "DROP INDEX IF EXISTS public." $6 ";"}' | psql -X -q -U supabase_admin -d "$db" >/dev/null
psql -X -q -U supabase_admin -d "$db" -v phase=seed -v rows="$rows" -f "$here/delete-timing-443.sql" 2>&1 | grep -v '^$'
psql -X -q -U supabase_admin -d "$db" -v phase=time -f "$here/delete-timing-443.sql" 2>&1 | grep -v '^$' | sed 's/^/before | /'
t0=$(date +%s.%N)
psql -X -q -U postgres -d "$db" -1 -v ON_ERROR_STOP=1 -f "$part" >/dev/null 2>&1 || { echo "part 443 failed"; exit 1; }
echo "part 443, first run on $rows rows per child: $(printf '%.1f' "$(echo "$(date +%s.%N) - $t0" | bc)") s"
psql -X -q -U supabase_admin -d "$db" -c "analyze" >/dev/null
psql -X -q -U supabase_admin -d "$db" -v phase=time -f "$here/delete-timing-443.sql" 2>&1 | grep -v '^$' | sed 's/^/after  | /'
n1=$(psql -X -At -U supabase_admin -d "$db" -c "select count(*) from pg_indexes where schemaname = 'public'")
t0=$(date +%s.%N)
psql -X -q -U postgres -d "$db" -1 -v ON_ERROR_STOP=1 -f "$part" >/dev/null 2>&1 || { echo "part 443 failed on its second run"; exit 1; }
n2=$(psql -X -At -U supabase_admin -d "$db" -c "select count(*) from pg_indexes where schemaname = 'public'")
echo "part 443, second run: $(printf '%.1f' "$(echo "$(date +%s.%N) - $t0" | bc)") s, indexes $n1 before and $n2 after"
PGOPTIONS="-c client_min_messages=warning" psql -X -q -U supabase_admin -d postgres -c "drop database if exists $db"

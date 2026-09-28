#!/usr/bin/env bash
# PROVES THE TWO FILES RUN ON A DATABASE SHAPED LIKE PRODUCTION, TWICE.
#
# The owner pastes supabase/sql/all-in-two/1_of_2_everything.sql and then
# 2_of_2_storage_policies_and_check.sql into the Supabase SQL editor of the
# live database. This builds that database locally and runs them the way the
# editor does (each file one transaction, stop at the first error):
#
#   1. a Postgres 16 cluster whose superuser is supabase_admin, with the roles,
#      auth, storage and extensions schemas Supabase gives a project
#      (supabase-shim.sql), and postgres as a NON superuser editor role;
#   2. the base: every file listed in base-files.txt, oldest first, which is
#      what production ran before run-now began (plus dashboard-made.sql, the
#      tables nothing in the repository creates), then a few rows (seed.sql);
#   3. the scenarios below, each on its own copy of the base.
#
# Scenarios (all by default, or name them: ./run.sh editor owner history legacy)
#   editor   postgres does not own storage.objects, as in the SQL editor: part 90
#            takes its documented skip. Both files, then what the app writes
#            with the values the parts allow (app-writes.sql), then both files
#            again. The second run must change nothing: the schema dump, the
#            storage policies and every row (fingerprint-rows.sql) before and
#            after it are compared.
#   owner    postgres is a member of supabase_storage_admin, so part 90 applies.
#            Both files twice; the check row must read all true.
#   history  the base plus older builds of the files, as production ran them
#            (git revisions in history-revs.txt), then today's two files twice.
#   legacy   the base with tables put back in the oldest shape some parts
#            upgrade, and the rows parts 03, 48 and 54 skip themselves for
#            (legacy.sql), then both files twice.
#   scale    not in the default set (a few minutes): file 1 on a shop with
#            300k orders and 1M page views (scale-seed.sql), timed, with every
#            statement over 250 ms listed. File 1 is one transaction, so this
#            is how long checkouts wait on the orders table.
#
# Every scenario runs with two clients (HARNESS_CLIENTS="wire psql" by default):
#   wire     simple_query.py sends each file as ONE query, which is what the
#            Supabase SQL editor does: one implicit transaction, first error
#            rolls back the whole paste.
#   psql     psql -1 -v ON_ERROR_STOP=1 -f, statement by statement in one
#            transaction.
#
# Needs: /usr/lib/postgresql/16/bin, psql, python3, and root (the server runs
# as the postgres OS user from /var/lib/postgresql, which the scratchpad is
# not). Env: HARNESS_PGDATA (default /var/lib/postgresql/sqlharness),
# HARNESS_PORT (default 55432), HARNESS_LOGS (default /tmp/sql-harness-logs).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin=/usr/lib/postgresql/16/bin
pgdata="${HARNESS_PGDATA:-/var/lib/postgresql/sqlharness}"
port="${HARNESS_PORT:-55432}"
logs="${HARNESS_LOGS:-/tmp/sql-harness-logs}"
read -r -a clients <<< "${HARNESS_CLIENTS:-wire psql}"
client=wire
file1="$root/supabase/sql/all-in-two/1_of_2_everything.sql"
file2="$root/supabase/sql/all-in-two/2_of_2_storage_policies_and_check.sql"
export PGHOST="$pgdata" PGPORT="$port"
mkdir -p "$logs"
chmod 777 "$logs" 2>/dev/null || true

say() { printf '%s\n' "$*"; }
as_admin() { psql -X -q -U supabase_admin "$@"; }
as_editor() { psql -X -q -U postgres "$@"; }

# THE CLUSTER. Made once, reused; supabase_admin is the bootstrap superuser.
start_cluster() {
  if [ ! -f "$pgdata/PG_VERSION" ]; then
    mkdir -p "$pgdata" && chown postgres:postgres "$pgdata"
    su postgres -c "$bin/initdb -D '$pgdata' -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null || exit 1
    echo "shared_preload_libraries = 'pg_stat_statements'" >> "$pgdata/postgresql.conf"
  fi
  if ! su postgres -c "$bin/pg_ctl -D '$pgdata' status" >/dev/null 2>&1; then
    su postgres -c "$bin/pg_ctl -D '$pgdata' -o '-p $port -k $pgdata' -l '$pgdata/server.log' -w start" >/dev/null || exit 1
  fi
}

# THE BASE: shim, then every base file as postgres. Statement by statement,
# because that is how the old scripts reached production; their errors are
# written to base-errors.txt for reading, not treated as failures. While the
# base is built postgres may act as the storage owner, because the old
# storage policies those scripts made are in production (the README says
# they are still in force until part 90 runs); it loses that before any
# scenario starts.
build_base() {
  PGOPTIONS="-c client_min_messages=warning" as_admin -d postgres -c "drop database if exists harness_base" -c "create database harness_base" || exit 1
  as_admin -d harness_base -v ON_ERROR_STOP=1 -f "$here/supabase-shim.sql" >/dev/null 2>"$logs/shim.txt" || { cat "$logs/shim.txt"; exit 1; }
  as_admin -d harness_base -c "revoke supabase_storage_admin from postgres" -c "grant supabase_storage_admin to postgres" 2>/dev/null
  : > "$logs/base-errors.txt"
  while IFS= read -r f; do
    case "$f" in ''|'#'*) continue;; esac
    out="$(as_editor -d harness_base -f "$root/$f" 2>&1 >/dev/null | grep -E 'ERROR' || true)"
    [ -n "$out" ] && printf '%s\n' "$out" >> "$logs/base-errors.txt"
  done < "$here/base-files.txt"
  as_editor -d harness_base -v ON_ERROR_STOP=1 -f "$here/seed.sql" >/dev/null 2>"$logs/seed.txt" || { cat "$logs/seed.txt"; exit 1; }
  as_admin -d harness_base -c "revoke supabase_storage_admin from postgres"
  say "base: $(as_editor -d harness_base -Atc "select count(*) from pg_tables where schemaname = 'public'") tables, $(grep -c . "$logs/base-errors.txt") old-script errors (see $logs/base-errors.txt)"
}

copy_base() { PGOPTIONS="-c client_min_messages=warning" as_admin -d postgres -c "drop database if exists $1" -c "create database $1 template harness_base" || exit 1; }

# ONE FILE, AS THE SQL EDITOR RUNS IT: one transaction, stop at the first error.
run_file() {
  local db="$1" file="$2" tag="$client-$3" ok
  if [ "$client" = wire ]; then
    python3 "$here/simple_query.py" "$pgdata" "$port" postgres "$db" "$file" >"$logs/$tag.out" 2>"$logs/$tag.err"; ok=$?
  else
    as_editor -d "$db" -1 -v ON_ERROR_STOP=1 -f "$file" >"$logs/$tag.out" 2>"$logs/$tag.err"; ok=$?
  fi
  if [ $ok = 0 ]; then
    say "  ok   $tag ($(grep -c 'NOTICE\|WARNING' "$logs/$tag.err") notices)"
    return 0
  fi
  say "  FAIL $tag"; grep -E 'ERROR|CONTEXT|LINE' "$logs/$tag.err" | head -8 | sed 's/^/       /'
  return 1
}

# WHAT A SECOND RUN MAY NOT CHANGE: the schema, every grant and policy, and
# every row (fingerprint-rows.sql).
fingerprint() {
  local db="$1"
  su postgres -c "$bin/pg_dump -h '$pgdata' -p $port -U supabase_admin --schema-only --no-comments -d $db" | grep -v -E '^--|^\\(un)?restrict ' > "$2.schema"
  as_admin -d "$db" -At -f "$here/fingerprint-rows.sql" > "$2.rows"
  as_admin -d "$db" -At -c "select coalesce(string_agg(format('%s %s', policyname, md5(coalesce(qual,'') || coalesce(with_check,''))), E'\n' order by policyname), '') from pg_policies where schemaname = 'storage'" > "$2.storage"
}

check_row() {
  local db="$1" tag="$client-$2"
  as_editor -d "$db" -x -f <(grep -v '^/\*\|^--' "$root/supabase/sql/run-now/99_check_after.sql") > "$logs/$tag.check" 2>&1
  local falses; falses="$(grep -E '\| (f|)$' "$logs/$tag.check" | awk '{print $1}' | tr '\n' ' ')"
  say "  check: $(grep -c '| t$' "$logs/$tag.check") true, $(grep -cE '\| (f|)$' "$logs/$tag.check") false or null ${falses:+($falses)}"
}

twice() {
  local db="$1" tag="$2" rc=0 fp="$logs/$client-$2"
  run_file "$db" "$file1" "$tag-1of2-first" || rc=1
  [ $rc = 0 ] && { run_file "$db" "$file2" "$tag-2of2-first" || rc=1; }
  [ $rc = 0 ] || return 1
  # The app writes with the values the parts newly allow before the second
  # run, as it will between one paste and the next (app-writes.sql).
  as_editor -d "$db" -v ON_ERROR_STOP=1 -f "$here/app-writes.sql" >/dev/null 2>"$fp-app-writes.err" || { say "  FAIL app-writes.sql"; head -5 "$fp-app-writes.err" | sed 's/^/       /'; return 1; }
  fingerprint "$db" "$fp-after-first"
  run_file "$db" "$file1" "$tag-1of2-second" || rc=1
  [ $rc = 0 ] && { run_file "$db" "$file2" "$tag-2of2-second" || rc=1; }
  [ $rc = 0 ] || return 1
  fingerprint "$db" "$fp-after-second"
  local same=1
  for k in schema rows storage; do
    if ! diff -q "$fp-after-first.$k" "$fp-after-second.$k" >/dev/null; then
      same=0; say "  CHANGED on the second run: $k (diff $fp-after-first.$k $fp-after-second.$k)"
      diff "$fp-after-first.$k" "$fp-after-second.$k" | head -20 | sed 's/^/       /'
    fi
  done
  [ $same = 1 ] && say "  second run changed nothing (schema, grants, policies, every row)"
  [ $same = 1 ]
}

scenario_editor() {
  say "editor: postgres does not own storage.objects (the SQL editor)"
  copy_base harness_editor_$client
  twice harness_editor_$client editor; local rc=$?
  check_row harness_editor_$client editor
  return $rc
}

scenario_owner() {
  say "owner: postgres may act as supabase_storage_admin, so part 90 applies"
  copy_base harness_owner_$client
  as_admin -d harness_owner_$client -c "grant supabase_storage_admin to postgres"
  twice harness_owner_$client owner; local rc=$?
  check_row harness_owner_$client owner
  as_admin -d harness_owner_$client -c "revoke supabase_storage_admin from postgres"
  return $rc
}

# OLDER BUILDS FIRST, as production ran them. Each line of history-revs.txt
# is a git revision and a path in it; the file at that revision is run as
# the editor would have (one transaction). A revision whose file failed on
# its own day is reported and skipped, since production would have rolled it
# back too.
scenario_history() {
  say "history: older builds of the files first, then today's"
  copy_base harness_history_$client
  local n=0
  while read -r rev path; do
    case "$rev" in ''|'#'*) continue;; esac
    n=$((n+1))
    git -C "$root" show "$rev:$path" > "$logs/$client-history-$n.sql" 2>/dev/null || { say "  skip $rev:$path (not in git)"; continue; }
    run_file harness_history_$client "$logs/$client-history-$n.sql" "history-$n-$(basename "$path" .sql)-at-$rev" || say "       (that old build failed on its own; production would have rolled it back too)"
  done < "$here/history-revs.txt"
  twice harness_history_$client history; local rc=$?
  check_row harness_history_$client history
  return $rc
}

scenario_legacy() {
  say "legacy: the oldest shapes some parts upgrade"
  copy_base harness_legacy_$client
  as_editor -d harness_legacy_$client -v ON_ERROR_STOP=1 -f "$here/legacy.sql" >/dev/null 2>"$logs/$client-legacy-setup.txt" || { cat "$logs/$client-legacy-setup.txt"; return 1; }
  twice harness_legacy_$client legacy; local rc=$?
  check_row harness_legacy_$client legacy
  return $rc
}

# HOW LONG FILE 1 HOLDS ITS LOCKS at a real shop's volume (scale-seed.sql),
# and which statements take the time. Not in the default set: it takes a few
# minutes. Every statement slower than 250 ms is listed from the server log.
scenario_scale() {
  say "scale: file 1 on $(grep -o '1M page views' "$here/scale-seed.sql" | head -1) and 300k orders"
  copy_base harness_scale_$client
  as_admin -d harness_scale_$client -v ON_ERROR_STOP=1 -f "$here/scale-seed.sql" >/dev/null 2>"$logs/scale-seed.txt" || { cat "$logs/scale-seed.txt"; return 1; }
  as_admin -d postgres -c "alter database harness_scale_$client set log_min_duration_statement = 250"
  local mark; mark=$(wc -l < "$pgdata/server.log")
  local t0; t0=$(date +%s.%N)
  run_file harness_scale_$client "$file1" "scale-1of2-first" || return 1
  say "  file 1, first run: $(printf '%.1f' "$(echo "$(date +%s.%N) - $t0" | bc)") s"
  tail -n +"$((mark + 1))" "$pgdata/server.log" | grep -o 'duration: [0-9.]* ms.*' | sort -t' ' -k2 -rn | head -12 | cut -c1-220 | sed 's/^/       /'
  t0=$(date +%s.%N)
  run_file harness_scale_$client "$file2" "scale-2of2-first" || return 1
  say "  file 2, first run: $(printf '%.1f' "$(echo "$(date +%s.%N) - $t0" | bc)") s"
  t0=$(date +%s.%N)
  run_file harness_scale_$client "$file1" "scale-1of2-second" || return 1
  say "  file 1, second run: $(printf '%.1f' "$(echo "$(date +%s.%N) - $t0" | bc)") s"
  as_admin -d postgres -c "alter database harness_scale_$client reset log_min_duration_statement"
}

start_cluster
build_base
scenarios=("$@"); [ ${#scenarios[@]} = 0 ] && scenarios=(editor owner history legacy)
status=0
for client in "${clients[@]}"; do
  say "== client: $client"
  for s in "${scenarios[@]}"; do "scenario_$s" || status=1; done
done
say "logs: $logs"
exit $status

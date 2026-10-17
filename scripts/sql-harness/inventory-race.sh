#!/usr/bin/env bash
# PROVES PART 214's STOCK FUNCTIONS, AND PART 78's HOLD, ON A REAL POSTGRES 16.
#
#   bash scripts/sql-harness/inventory-race.sh
#
# A cluster of its own (INV_PGDATA, default /var/lib/postgresql/inv214, port
# INV_PORT, default 55439), a database with only the stock tables
# (inventory-base.sql), part 78's four stock functions taken from the file,
# and part 214 run twice, each run as one transaction, the way the SQL editor
# runs a paste. Then:
#
#   1. thirty buyers hold the last five units at the same instant: five
#      holds, twenty five refused, available never under zero
#   2. twenty adds at once with their own keys: all twenty land; ten presses
#      with one key: one lands
#   3. adjust: add, remove, set, a remove past zero refused, set to the same
#      number unchanged, incoming, a reason outside the list a correction
#   4. transfers: one item short and nothing moves, sent, received in part,
#      the rest cancelled back to the origin, a draft cancelled, sent twice
#      refused
#   5. the history: an edit or a delete refused, a deleted product clears
#      its id and keeps the row
#   6. another shop's variant, location or transfer: not found
#   7. only service_role may call the functions
#
# Needs /usr/lib/postgresql/16/bin, psql, and root (the server runs as the
# postgres OS user).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin=/usr/lib/postgresql/16/bin
pgdata="${INV_PGDATA:-/var/lib/postgresql/inv214}"
port="${INV_PORT:-55439}"
part78="$root/supabase/sql/run-now/78_physical_commerce.sql"
part214="$root/supabase/sql/run-now/214_inventory_and_files.sql"
out="$(mktemp -d)"
chmod 777 "$out"
fail=0
say() { printf '%s\n' "$*"; }
check() { if [ "$2" = "$3" ]; then say "  ok    $1 ($2)"; else say "  FAIL  $1: got '$2', want '$3'"; fail=1; fi; }

if [ ! -f "$pgdata/PG_VERSION" ]; then
  mkdir -p "$pgdata" && chown postgres:postgres "$pgdata"
  su postgres -c "$bin/initdb -D '$pgdata' -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null || exit 1
  echo "max_connections = 200" >> "$pgdata/postgresql.conf"
fi
if ! su postgres -c "$bin/pg_ctl -D '$pgdata' status" >/dev/null 2>&1; then
  su postgres -c "$bin/pg_ctl -D '$pgdata' -o '-p $port -k $pgdata' -l '$pgdata/server.log' -w start" >/dev/null || exit 1
fi
A="psql -X -q -h $pgdata -p $port -U supabase_admin"
$A -d postgres -c "drop database if exists inv214;" >/dev/null 2>&1
$A -d postgres -c "create database inv214;" >/dev/null || exit 1
P="$A -d inv214"
SR() { $P -At -c "set role service_role; $1" 2>&1; }

$P -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if; end \$\$;" >/dev/null
$P -v ON_ERROR_STOP=1 -f "$here/inventory-base.sql" >/dev/null || exit 1
for fn in physical_inventory_apply physical_reserve physical_release physical_mark_sold; do
  awk -v fn="CREATE OR REPLACE FUNCTION public.$fn(" 'index($0, fn) == 1 { on = 1 } on { print } on && /^END \$f\$;/ { on = 0 }' "$part78" > "$out/$fn.sql"
  $P -v ON_ERROR_STOP=1 -f "$out/$fn.sql" >/dev/null || { say "part 78's $fn did not load"; exit 1; }
done
$P -c "create table public.creators_shadow (x int);" >/dev/null 2>&1
say "part 214, twice, each as one transaction"
for run in 1 2; do
  if $P -1 -v ON_ERROR_STOP=1 -f "$part214" > "$out/run$run.log" 2>&1; then say "  ok    run $run"; else say "  FAIL  run $run"; cat "$out/run$run.log"; fail=1; fi
done

SHOP=00000000-0000-4000-b000-000000000001
OTHER=00000000-0000-4000-b000-000000000002
PROD=00000000-0000-4000-c000-000000000001
VAR=00000000-0000-4000-c100-000000000001
VAR2=00000000-0000-4000-c100-000000000002
OVAR=00000000-0000-4000-c100-000000000009
L1=00000000-0000-4000-d000-000000000001
L2=00000000-0000-4000-d000-000000000002
OL=00000000-0000-4000-d000-000000000009
USER=00000000-0000-4000-a000-000000000001
$P -c "insert into public.creators (id, user_id) values ('$SHOP', '$USER'), ('$OTHER', null);
insert into public.products (id, creator_id, title) values ('$PROD', '$SHOP', 'Mug'), ('00000000-0000-4000-c000-000000000009', '$OTHER', 'Theirs');
insert into public.product_variants (id, product_id, name) values ('$VAR', '$PROD', 'Blue'), ('$VAR2', '$PROD', 'Red'), ('$OVAR', '00000000-0000-4000-c000-000000000009', 'Default');
insert into public.inventory_locations (id, creator_id, name) values ('$L1', '$SHOP', 'Home'), ('$L2', '$SHOP', 'Warehouse'), ('$OL', '$OTHER', 'Theirs');" >/dev/null
level() { $P -At -c "select on_hand || '/' || committed || '/' || incoming || '/' || available from public.inventory_levels where variant_id = '$1' and location_id = '$2';"; }
adjust() { SR "select public.physical_inventory_adjust('$SHOP', '$1', '$2', '$3', '$4', $5, '$6', null, $7, '$USER', null)::text;"; }

say "1. thirty buyers hold the last five units at the same instant"
adjust "$VAR" "$L1" on_hand set 5 received null >/dev/null
at="$(date -u -d '+3 seconds' '+%Y-%m-%d %H:%M:%S')"
for i in $(seq 1 30); do
  ( $P -At -c "set role service_role; insert into public.commerce_checkouts (id, creator_id) values ('00000000-0000-4000-e000-$(printf '%012d' "$i")', '$SHOP'); select pg_sleep(greatest(0, extract(epoch from (timestamptz '$at UTC' - clock_timestamp())))); select public.physical_reserve('00000000-0000-4000-e000-$(printf '%012d' "$i")', '[{\"variant_id\":\"$VAR\",\"location_id\":\"$L1\",\"quantity\":1}]'::jsonb, now() + interval '15 minutes')::text;" > "$out/r$i" 2>&1 ) &
done
wait
check "holds given" "$(cat "$out"/r* | grep -c '"applied": true')" "5"
check "holds refused as out of stock" "$(cat "$out"/r* | grep -c 'out_of_stock')" "25"
check "on hand / committed / incoming / available" "$(level "$VAR" "$L1")" "5/5/0/0"
check "one written hold per unit" "$($P -At -c "select count(*) from public.inventory_movements where reason = 'order_reserved';")" "5"
check "available was never under zero after any hold" "$($P -At -c "select count(*) from public.inventory_movements where reason = 'order_reserved' and on_hand_after - committed_after < 0;")" "0"

say "2. presses at the same moment"
at="$(date -u -d '+3 seconds' '+%Y-%m-%d %H:%M:%S')"
for i in $(seq 1 20); do
  ( $P -At -c "set role service_role; select pg_sleep(greatest(0, extract(epoch from (timestamptz '$at UTC' - clock_timestamp())))); select public.physical_inventory_adjust('$SHOP', '$VAR2', '$L1', 'on_hand', 'add', 1, 'received', null, 'adjust:k$i', '$USER', null)::text;" > "$out/a$i" 2>&1 ) &
done
wait
check "twenty adds with their own keys" "$(level "$VAR2" "$L1")" "20/0/0/20"
at="$(date -u -d '+3 seconds' '+%Y-%m-%d %H:%M:%S')"
for i in $(seq 1 10); do
  ( $P -At -c "set role service_role; select pg_sleep(greatest(0, extract(epoch from (timestamptz '$at UTC' - clock_timestamp())))); select public.physical_inventory_adjust('$SHOP', '$VAR2', '$L1', 'on_hand', 'add', 3, 'received', null, 'adjust:same', '$USER', null)::text;" > "$out/s$i" 2>&1 ) &
done
wait
check "ten presses with one key: one change" "$(level "$VAR2" "$L1")" "23/0/0/23"
check "  and no press failed" "$(cat "$out"/s* | grep -c ERROR)" "0"

say "3. adjust"
adjust "$VAR2" "$L2" on_hand add 10 received null >/dev/null
check "add 10 received" "$(level "$VAR2" "$L2")" "10/0/0/10"
adjust "$VAR2" "$L2" on_hand remove 3 damaged null >/dev/null
check "remove 3 damaged" "$(level "$VAR2" "$L2")" "7/0/0/7"
r="$(adjust "$VAR2" "$L2" on_hand remove 8 theft_or_loss null)"
check "remove past zero refused" "$(echo "$r" | grep -o '"error": "below_zero"')" '"error": "below_zero"'
check "  and nothing changed" "$(level "$VAR2" "$L2")" "7/0/0/7"
adjust "$VAR2" "$L2" on_hand set 12 count null >/dev/null
check "set to 12" "$(level "$VAR2" "$L2")" "12/0/0/12"
check "unchanged when set to the same" "$(adjust "$VAR2" "$L2" on_hand set 12 count null | grep -o '"unchanged": true')" '"unchanged": true'
adjust "$VAR2" "$L2" incoming add 4 received null >/dev/null
check "4 on order" "$(level "$VAR2" "$L2")" "12/0/4/12"
adjust "$VAR2" "$L2" on_hand add 1 nonsense null >/dev/null
check "a reason outside the list is a correction" "$($P -At -c "select reason from public.inventory_movements where variant_id = '$VAR2' and location_id = '$L2' order by id desc limit 1;")" "correction"
adjust "$VAR2" "$L2" on_hand add 1 other null >/dev/null
check "Other is kept" "$($P -At -c "select reason || ':' || actor || ':' || actor_user_id from public.inventory_movements where variant_id = '$VAR2' and location_id = '$L2' order by id desc limit 1;")" "other:creator:$USER"
check "before and after are written" "$($P -At -c "select (on_hand_after - delta_on_hand) || '->' || on_hand_after from public.inventory_movements where variant_id = '$VAR2' and location_id = '$L2' order by id desc limit 1;")" "13->14"
check "a quantity under zero refused" "$(adjust "$VAR2" "$L2" on_hand add -2 received null | grep -o bad_quantity)" "bad_quantity"

say "4. transfers"
T1=00000000-0000-4000-f000-000000000001
$P -c "insert into public.inventory_transfers (id, creator_id, origin_location_id, destination_location_id) values ('$T1', '$SHOP', '$L2', '$L1');
insert into public.inventory_transfer_items (id, transfer_id, variant_id, quantity) values ('00000000-0000-4000-f100-000000000001', '$T1', '$VAR2', 6), ('00000000-0000-4000-f100-000000000002', '$T1', '$VAR', 2);" >/dev/null
r="$(SR "select public.physical_transfer_ship('$SHOP', '$T1', '$USER')::text;")"
check "one item short: refused" "$(echo "$r" | grep -o 'transfer_short:[0-9a-f-]*' | cut -d: -f2)" "$VAR"
check "  and nothing left the origin" "$(level "$VAR2" "$L2")" "14/0/4/14"
check "  and the transfer is still a draft" "$($P -At -c "select status from public.inventory_transfers where id = '$T1';")" "draft"
$P -c "delete from public.inventory_transfer_items where id = '00000000-0000-4000-f100-000000000002';" >/dev/null
SR "select public.physical_transfer_ship('$SHOP', '$T1', '$USER')::text;" >/dev/null
check "sent: out of the origin" "$(level "$VAR2" "$L2")" "8/0/4/8"
check "  incoming at the destination" "$(level "$VAR2" "$L1")" "23/0/6/23"
check "sent twice refused" "$(SR "select public.physical_transfer_ship('$SHOP', '$T1', '$USER')::text;" | grep -o wrong_status)" "wrong_status"
SR "select public.physical_transfer_receive('$SHOP', '$T1', '[{\"item_id\":\"00000000-0000-4000-f100-000000000001\",\"quantity\":4}]'::jsonb, '$USER')::text;" >/dev/null
check "4 of 6 received" "$(level "$VAR2" "$L1")" "27/0/2/27"
check "  partly received" "$($P -At -c "select status from public.inventory_transfers where id = '$T1';")" "partially_received"
check "  received the same again is a new 4 only if there is room" "$(SR "select public.physical_transfer_receive('$SHOP', '$T1', '[{\"item_id\":\"00000000-0000-4000-f100-000000000001\",\"quantity\":40}]'::jsonb, '$USER')::text;" | grep -o '"received": [0-9]*')" '"received": 2'
check "  received in full" "$($P -At -c "select status from public.inventory_transfers where id = '$T1';")" "received"
check "  cancelling a received transfer refused" "$(SR "select public.physical_transfer_cancel('$SHOP', '$T1', '$USER')::text;" | grep -o wrong_status)" "wrong_status"
T2=00000000-0000-4000-f000-000000000002
$P -c "insert into public.inventory_transfers (id, creator_id, origin_location_id, destination_location_id) values ('$T2', '$SHOP', '$L1', '$L2');
insert into public.inventory_transfer_items (id, transfer_id, variant_id, quantity) values ('00000000-0000-4000-f100-000000000003', '$T2', '$VAR2', 5);" >/dev/null
SR "select public.physical_transfer_ship('$SHOP', '$T2', '$USER')::text;" >/dev/null
SR "select public.physical_transfer_receive('$SHOP', '$T2', '[{\"item_id\":\"00000000-0000-4000-f100-000000000003\",\"quantity\":2}]'::jsonb, '$USER')::text;" >/dev/null
SR "select public.physical_transfer_cancel('$SHOP', '$T2', '$USER')::text;" >/dev/null
check "cancelled after 2 of 5 arrived: 3 back at the origin (29, 5 sent, 3 back)" "$(level "$VAR2" "$L1")" "27/0/0/27"
check "  the 2 stay, nothing left incoming" "$(level "$VAR2" "$L2")" "10/0/4/10"
check "  written as a cancelled transfer" "$($P -At -c "select count(*) from public.inventory_movements where reason = 'transfer_cancelled' and ref_id = '$T2';")" "1"
T3=00000000-0000-4000-f000-000000000003
$P -c "insert into public.inventory_transfers (id, creator_id, origin_location_id, destination_location_id) values ('$T3', '$SHOP', '$L1', '$L2');" >/dev/null
check "a draft cancelled" "$(SR "select public.physical_transfer_cancel('$SHOP', '$T3', '$USER')::text;" | grep -o '"returned": 0')" '"returned": 0'

say "5. the history"
check "an edit refused" "$($P -At -c "set role service_role; update public.inventory_movements set delta_on_hand = 99 where id = 1;" 2>&1 | grep -o 'append only')" "append only"
check "a delete refused" "$($P -At -c "set role service_role; delete from public.inventory_movements where id = 1;" 2>&1 | grep -o 'append only')" "append only"
before="$($P -At -c "select count(*) from public.inventory_movements;")"
$P -c "delete from public.product_variants where id = '$VAR';" >/dev/null 2>&1
check "a deleted variant: its rows stay" "$($P -At -c "select count(*) from public.inventory_movements;")" "$before"
check "  with its id cleared" "$($P -At -c "select count(*) from public.inventory_movements where variant_id = '$VAR';")" "0"

say "6. another shop"
check "their variant" "$(adjust "$OVAR" "$L1" on_hand add 1 received null | grep -o not_found)" "not_found"
check "their location" "$(adjust "$VAR2" "$OL" on_hand add 1 received null | grep -o not_found)" "not_found"
check "a transfer of mine named with their shop" "$(SR "select public.physical_transfer_cancel('$OTHER', '$T2', null)::text;" | grep -o not_found)" "not_found"

say "7. who may call"
for f in "physical_inventory_adjust('$SHOP', '$VAR2', '$L1', 'on_hand', 'add', 1, 'received', null, null, null, null)" "physical_transfer_ship('$SHOP', '$T1', null)" "physical_inventory_move('$SHOP', '$VAR2', '$L1', 1, 0, 0, 'received', null, null, null, 'creator', null, null, false)"; do
  check "authenticated refused: ${f%%(*}" "$($P -At -c "set role authenticated; select public.$f;" 2>&1 | grep -o 'permission denied' | head -1)" "permission denied"
done

su postgres -c "$bin/pg_ctl -D '$pgdata' -m fast stop" >/dev/null 2>&1
rm -rf "$out"
if [ "$fail" = 0 ]; then say "all passed"; else say "FAILED"; fi
exit "$fail"

#!/usr/bin/env bash
# PROVES PART 133's HOLD UNDER A RACE, on a database run.sh left behind.
#
# Run run.sh first (any scenario), then: bash scripts/sql-harness/sales-limit-race.sh [database]
# Forty connections ask for the last five copies of one product at the same
# instant; exactly five must be given. Then: a second press refreshes, a
# release frees, a lapsed place is cleared, orders count (a full refund gives
# its copy back, a partial one does not), an order can be written while a
# hold has the product row, no limit means nothing held, and only
# service_role may call. Env: HARNESS_PGDATA, HARNESS_PORT as run.sh.
set -uo pipefail
DB="${1:-harness_editor_wire}"
P="psql -X -q -h ${HARNESS_PGDATA:-/var/lib/postgresql/sqlharness} -p ${HARNESS_PORT:-55432} -U supabase_admin -d $DB"
PROD=00000000-0000-4000-c000-000000000001
out="$(mktemp -d)"
say() { printf '%s\n' "$*"; }
fail=0
check() { if [ "$2" = "$3" ]; then say "  ok    $1 ($2)"; else say "  FAIL  $1: got '$2', want '$3'"; fail=1; fi; }

# A clean start: no holds, the seed's orders for this product counted, limit = sold + 5.
$P -c "delete from public.product_sale_holds;"
SOLD=$($P -At -c "set role service_role; select public.product_copies_sold('$PROD');")
LIMIT=$((SOLD + 5))
$P -c "update public.products set sales_limit = $LIMIT where id = '$PROD';"
say "product $PROD: sold $SOLD, limit $LIMIT, so 5 copies left"

# 1. Forty buyers at once, each holding one copy, each in its own connection, released together by a barrier.
say "1. forty buyers press Pay at the same moment for 5 copies"
for i in $(seq 1 40); do
  ( $P -At -c "set role service_role; select pg_sleep(greatest(0, extract(epoch from (timestamptz '$(date -u -d '+3 seconds' '+%Y-%m-%d %H:%M:%S') UTC' - clock_timestamp())))); select public.hold_product_sale('$PROD', 'e:buyer$i', 1, 2100);" > "$out/b$i" 2>&1 ) &
done
wait
WON=$(cat "$out"/b* | grep -c '^t$'); LOST=$(cat "$out"/b* | grep -c '^f$'); ERR=$(cat "$out"/b* | grep -v '^$' | grep -vc '^[tf]$')
check "holds given" "$WON" "5"
check "holds refused" "$LOST" "35"
check "errors" "$ERR" "0"
check "rows held" "$($P -At -c "select count(*) from public.product_sale_holds where product_id = '$PROD';")" "5"

# 2. The same holder pressing Pay again (a declined card) refreshes its place, never takes a second.
say "2. a second press by a holder refreshes its place"
H=$($P -At -c "select holder from public.product_sale_holds where product_id = '$PROD' limit 1;")
check "same holder again" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', '$H', 1, 2100);")" "t"
check "still five places" "$($P -At -c "select count(*) from public.product_sale_holds where product_id = '$PROD';")" "5"
check "a new holder is refused" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:late', 1, 2100);")" "f"

# 3. Released: the copy is free again.
say "3. a released place goes to the next buyer"
$P -At -c "set role service_role; select public.release_product_sale('$PROD', '$H');" >/dev/null
check "next buyer after release" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:late', 1, 2100);")" "t"

# 4. Lapsed places are cleared on the way.
say "4. a lapsed place is cleared"
$P -c "update public.product_sale_holds set expires_at = now() - interval '1 second' where holder = 'e:late';"
check "lapsed place taken by another" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:other', 1, 2100);")" "t"
check "lapsed row gone" "$($P -At -c "select count(*) from public.product_sale_holds where holder = 'e:late';")" "0"

# 5. Orders count, a full refund gives the copy back, a partial refund keeps it.
say "5. orders: paid counts, fully refunded gives back, partly refunded counts"
$P -c "delete from public.product_sale_holds;"
BUYER_COLS="product_id, amount_cents, status, receipt_token"
$P -c "insert into public.orders ($BUYER_COLS) values ('$PROD', 1000, 'completed', 'd21-a'), ('$PROD', 1000, 'refunded', 'd21-b'), ('$PROD', 1000, 'completed', 'd21-c');" 2>&1 | tail -1
$P -c "update public.orders set refund_amount_cents = 1000 where receipt_token = 'd21-b';"
check "paid + full refund" "$($P -At -c "set role service_role; select public.product_copies_sold('$PROD');")" "$((SOLD + 2))"
$P -c "update public.orders set refund_amount_cents = 300 where receipt_token = 'd21-b';"
check "paid + partial refund" "$($P -At -c "set role service_role; select public.product_copies_sold('$PROD');")" "$((SOLD + 3))"
$P -c "update public.orders set quantity = 2 where receipt_token = 'd21-c';"
check "a line of two copies" "$($P -At -c "set role service_role; select public.product_copies_sold('$PROD');")" "$((SOLD + 4))"
check "status row" "$($P -At -c "set role service_role; select sales_limit || '/' || sold || '/' || held from public.product_sales_status(array['$PROD']::uuid[]);")" "$LIMIT/$((SOLD + 4))/0"
check "one left: a hold of two refused" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:two', 2, 2100);")" "f"
check "one left: a hold of one given" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:one', 1, 2100);")" "t"

# 6. A paid order is written beside a held product row: the lock does not block the order's foreign key.
say "6. an order insert is not blocked while a hold runs"
( $P -At -c "set role service_role; begin; select 1 from public.products where id = '$PROD' for no key update; select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 0.5
T0=$(date +%s%N)
$P -c "set statement_timeout = '2s'; insert into public.orders (product_id, amount_cents, status, receipt_token) values ('$PROD', 1000, 'completed', 'd21-d');" > "$out/fk" 2>&1
T1=$(date +%s%N)
wait
check "order insert while locked" "$(grep -c ERROR "$out/fk")" "0"
say "        took $(( (T1 - T0) / 1000000 )) ms"

# 7. No limit: always yes, nothing held. Nobody but the server may call.
say "7. no limit, and who may call"
$P -c "update public.products set sales_limit = null where id = '$PROD';"
check "no limit: yes" "$($P -At -c "set role service_role; select public.hold_product_sale('$PROD', 'e:free', 1, 2100);")" "t"
check "no limit: nothing held" "$($P -At -c "select count(*) from public.product_sale_holds where holder = 'e:free';")" "0"
check "no limit: not in status" "$($P -At -c "set role service_role; select count(*) from public.product_sales_status(array['$PROD']::uuid[]);")" "0"
for role in anon authenticated; do
  for fn in "hold_product_sale('$PROD', 'x', 1, 60)" "release_product_sale('$PROD', 'x')" "product_sales_status(array['$PROD']::uuid[])" "product_copies_sold('$PROD')"; do
    r=$($P -At -c "set role $role; select public.$fn;" 2>&1 | grep -c "permission denied")
    check "$role cannot call ${fn%%(*}" "$r" "1"
  done
  check "$role cannot read holds" "$($P -At -c "set role $role; select count(*) from public.product_sale_holds;" 2>&1 | grep -c "permission denied")" "1"
done
check "limit 0 refused by the check" "$($P -At -c "update public.products set sales_limit = 0 where id = '$PROD';" 2>&1 | grep -c products_sales_limit_check)" "1"
check "limit 1000001 refused by the check" "$($P -At -c "update public.products set sales_limit = 1000001 where id = '$PROD';" 2>&1 | grep -c products_sales_limit_check)" "1"

# Clean up what this added.
$P -c "delete from public.orders where receipt_token like 'd21-%'; delete from public.product_sale_holds; update public.products set sales_limit = null where id = '$PROD';"
[ "$fail" = 0 ] && say "all passed" || say "FAILED"
exit $fail

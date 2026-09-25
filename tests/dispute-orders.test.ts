/**
 * ===========================================================================
 *  A DISPUTE, ON EVERY ROW OF THE PAYMENT
 * ===========================================================================
 * lib/stripe/dispute-orders.ts marks a disputed payment and restores a won
 * one. The webhook used to find the order with `.maybeSingle()` on the
 * PaymentIntent: a basket has a row per product under one PaymentIntent, so
 * the lookup errored, nothing was marked, and the payment kept counting as a
 * sale in every figure while the bank held its money. What this pins:
 *
 *   every row of a basket is marked disputed, and only the rows that were sales
 *   a won dispute restores every row, each to what it was
 *   a lost dispute leaves them disputed, so they stay out of the figures
 *   the webhook uses these, and no longer reads one row
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { disputedProductName, markPaymentDisputed, restorePaymentAfterWonDispute, statusAfterWonDispute } from "../lib/stripe/dispute-orders"
import { groupOrders, isSale, type OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ─── A table in memory that answers the calls the module makes ─────────── */

type Row = Record<string, unknown>
function fakeDb(rows: Row[]) {
  const calls: string[] = []
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    let patch: Row | null = null
    const q = {
      select(_cols: string) { calls.push(`select ${table}`); return q },
      update(values: Row) { patch = values; calls.push(`update ${table}`); return q },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return q },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return q },
      maybeSingle() { throw new Error("a payment is several rows: never one") },
      then(resolve: (v: { data: Row[] | null; error: null }) => unknown) {
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        if (patch) for (const r of hit) Object.assign(r, patch)
        return Promise.resolve(resolve({ data: hit.map((r) => ({ ...r })), error: null }))
      },
    }
    return q
  }
  return { from, calls }
}

const line = (id: string, extra: Row = {}): Row => ({
  id,
  product_id: `p_${id}`,
  amount_cents: 1000,
  status: "completed",
  created_at: `2026-09-20T12:00:0${id.length}Z`,
  stripe_payment_intent_id: "pi_basket",
  stripe_session_id: "cs_basket",
  ...extra,
})

async function main() {
  console.log("\nA basket disputed: every row of the payment")
  {
    const rows = [
      line("a"),
      line("b", { status: "refunded", refund_amount_cents: 300, refunded_at: "2026-09-21T00:00:00Z" }),
      line("c"),
      line("d", { status: "failed" }),
      line("other", { stripe_payment_intent_id: "pi_other", stripe_session_id: "cs_other" }),
    ]
    const db = fakeDb(rows)
    const marked = await markPaymentDisputed(db, "pi_basket")
    const status = (id: string) => rows.find((r) => r.id === id)!.status
    check("all three sale rows are marked disputed", ["a", "b", "c"].every((id) => status(id) === "disputed"), rows.map((r) => r.status))
    check("  the failed row of the same payment is left alone", status("d") === "failed")
    check("  and another payment is not touched", status("other") === "completed")
    check("  the marked rows come back, to name the products", marked.map((r) => r.id).sort().join() === "a,b,c")

    const orders = groupOrders(rows.filter((r) => r.stripe_payment_intent_id === "pi_basket") as unknown as OrderRow[])
    check("the basket reads as one disputed order, and not a sale", orders.length === 1 && orders[0].payment === "disputed" && !isSale(orders[0]))

    const again = await markPaymentDisputed(db, "pi_basket")
    check("a repeated event changes nothing", ["a", "b", "c"].every((id) => status(id) === "disputed") && again.length === 3)

    console.log("\nWon: every row back to what it was")
    const restored = await restorePaymentAfterWonDispute(db, "pi_basket")
    check("all three rows are restored", restored === 3, restored)
    check("  the untouched rows are completed again", status("a") === "completed" && status("c") === "completed")
    check("  and the partly refunded row is refunded again, not a full sale", status("b") === "refunded", status("b"))
    check("  the failed row stays failed", status("d") === "failed")
    const back = groupOrders(rows.filter((r) => r.stripe_payment_intent_id === "pi_basket") as unknown as OrderRow[])
    check("the basket is a sale again, less its refund", back.length === 1 && isSale(back[0]) && back[0].refundedCents === 300)
    check("a second won event restores nothing more", (await restorePaymentAfterWonDispute(db, "pi_basket")) === 0)
    check("no row was read with maybeSingle", !db.calls.some((c) => /maybeSingle/.test(c)))
  }

  console.log("\nOne row, the common case, still works")
  {
    const rows = [line("solo", { stripe_payment_intent_id: "pi_solo", stripe_session_id: null })]
    const db = fakeDb(rows)
    await markPaymentDisputed(db, "pi_solo")
    check("a single order is marked disputed", rows[0].status === "disputed")
    await restorePaymentAfterWonDispute(db, "pi_solo")
    check("  and restored when won", rows[0].status === "completed")
  }

  console.log("\nWhat a restored row goes back to")
  check("no refund: completed", statusAfterWonDispute({ refund_amount_cents: null, refunded_at: null }) === "completed")
  check("a recorded refund amount: refunded", statusAfterWonDispute({ refund_amount_cents: 1, refunded_at: null }) === "refunded")
  check("a refund time without an amount: refunded", statusAfterWonDispute({ refund_amount_cents: 0, refunded_at: "2026-09-01T00:00:00Z" }) === "refunded")

  console.log("\nThe email names what was disputed")
  check("one product by its name", disputedProductName(["Guide"]) === "Guide")
  check("a basket by its first and how many more", disputedProductName(["Guide", "Preset", null]) === "Guide and 1 more")
  check("nothing known, nothing named", disputedProductName([null, ""]) === null)

  console.log("\nThe webhook")
  {
    const hook = strip(read("app/api/stripe/webhook/route.ts"))
    const disputeBlock = hook.slice(hook.indexOf('event.type === "charge.dispute.created" ||'))
    check("marks the payment's rows through markPaymentDisputed", /await markPaymentDisputed\(supabaseAdmin, paymentIntentId\)/.test(disputeBlock))
    check("  restores a won dispute through restorePaymentAfterWonDispute", /await restorePaymentAfterWonDispute\(supabaseAdmin, piId\)/.test(disputeBlock))
    check("  and no longer reads one order of the payment with maybeSingle",
      !/\.eq\("stripe_payment_intent_id", paymentIntentId\)\s*\.maybeSingle\(\)/.test(disputeBlock) && !/disputeOrder/.test(disputeBlock))
    check("  nor sets every disputed row to completed whatever it was", !/\.update\(\{ status: "completed" \}\)\s*\.eq\("stripe_payment_intent_id", piId\)/.test(disputeBlock))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

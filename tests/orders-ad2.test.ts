/**
 * ===========================================================================
 *  ORDERS, END TO END: THE BUGS ROUND AD2 FOUND
 * ===========================================================================
 * Each block is a bug that was in the code, with the case that showed it:
 *
 *   a chargeback left the product in the buyer's library (a course stayed
 *     open), and a won one never gave a closed one back
 *   a membership's payment went on the seller's balance in its own currency
 *     unconverted (a ¥1000 renewal was $10.00), and a dispute took its
 *     amount off the balance the same way
 *   a corrected email on an order that ships never reached its checkout, so
 *     the shipped and delivered emails kept going to the mistyped address
 *   an order that ships wrote its money as if every currency had cents:
 *     "Payment of ¥25.00 received" for ¥2500, and "¥3 off" on Stripe's page
 *   the old Checkout Session path reset a returning customer to 1 order
 *   a part refunded line could never be refunded again from Orders, an
 *     Airwallex sale had no Refund at all, and a team member was offered
 *     Refund on an order that ships
 *   the Customers page matched orders by exact case
 *   a second part refund showed only itself as the line's refunded total
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { closeAccessForDispute, markPaymentDisputed, reopenAccessAfterWonDispute, restorePaymentAfterWonDispute } from "../lib/stripe/dispute-orders"
import { moveCheckoutEmail } from "../lib/orders/checkout-email"
import { canRefundLine, refundableCents, groupOrders, type OrderRow } from "../lib/orders/order-view"
import { formatMinor } from "../lib/markets/money"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ─── A database in memory that answers what the modules ask ──────────── */

type Row = Record<string, any>
function memoryDb(tables: Record<string, Row[]>) {
  const writes: string[] = []
  const from = (name: string) => {
    const rows = (tables[name] ||= [])
    const filters: Array<(r: Row) => boolean> = []
    let mode: "select" | "update" | "delete" = "select"
    let patch: Row = {}
    const run = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r)))
      if (mode === "update") {
        hit.forEach((r) => Object.assign(r, patch))
        writes.push(`update ${name}`)
      }
      if (mode === "delete") {
        hit.forEach((r) => rows.splice(rows.indexOf(r), 1))
        writes.push(`delete ${name}`)
      }
      return { data: hit.map((r) => ({ ...r })), error: null }
    }
    const api: any = {
      select: () => api,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), api),
      update: (p: Row) => ((mode = "update"), (patch = p), api),
      delete: () => ((mode = "delete"), api),
      insert: async (row: Row) => {
        rows.push({ id: `${name}_${rows.length + 1}`, ...row })
        writes.push(`insert ${name}`)
        return { error: null }
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(run())),
    }
    return api
  }
  return { from, writes }
}

/** Whether the buyer can open the product the way lib/courses/server ownsProduct asks: an entitlement, or a completed order. */
function owns(db: { from: (t: string) => any }, tables: Record<string, Row[]>, buyer: string, product: string): boolean {
  return tables.entitlements.some((e) => e.buyer_id === buyer && e.product_id === product) || tables.orders.some((o) => o.buyer_id === buyer && o.product_id === product && o.status === "completed")
}

async function main() {
  console.log("\n1. A chargeback closes the product, and a won dispute opens it again")
  {
    const tables: Record<string, Row[]> = {
      orders: [
        { id: "o1", buyer_id: "u1", product_id: "course", variant_id: null, status: "completed", amount_cents: 5000, stripe_payment_intent_id: "pi_1", created_at: "2026-10-01T00:00:00Z" },
        { id: "o2", buyer_id: "u1", product_id: "mug", variant_id: null, status: "completed", amount_cents: 2000, stripe_payment_intent_id: "pi_1", requires_shipping: true, created_at: "2026-10-01T00:00:01Z" },
      ],
      entitlements: [{ id: "e1", buyer_id: "u1", product_id: "course", variant_id: null }],
      products: [
        { id: "course", creator_id: "c1", type: "course" },
        { id: "mug", creator_id: "c1", type: "physical" },
      ],
    }
    const db = memoryDb(tables)
    const hook: Array<{ productId: string; granted: boolean }> = []
    const onAccess = async (_db: unknown, e: { productId: string; granted: boolean }) => void hook.push({ productId: e.productId, granted: e.granted })
    check("before: the buyer has the course", owns(db, tables, "u1", "course"))
    await markPaymentDisputed(db, "pi_1")
    check("the dispute marks the rows disputed", tables.orders.every((o) => o.status === "disputed"))
    check("but the course would stay open on its library entry (the bug)", owns(db, tables, "u1", "course"))
    const closed = await closeAccessForDispute(db, "pi_1", "stripe_payment_intent_id", onAccess)
    check("the dispute takes the course out of the library", closed === 1 && !owns(db, tables, "u1", "course"), tables.entitlements)
    check("and the communities it opened are told", hook.some((h) => h.productId === "course" && h.granted === false))
    await closeAccessForDispute(db, "pi_1")
    check("a second delivery of the event changes nothing", tables.entitlements.length === 0)

    await restorePaymentAfterWonDispute(db, "pi_1")
    const opened = await reopenAccessAfterWonDispute(db, "pi_1", "stripe_payment_intent_id", onAccess)
    check("a won dispute gives the course back, once", opened === 1 && tables.entitlements.filter((e) => e.product_id === "course").length === 1 && owns(db, tables, "u1", "course"))
    check("with its creator, as every library entry has", tables.entitlements[0]?.creator_id === "c1")
    check("nothing is made for the mug, which never had one", !tables.entitlements.some((e) => e.product_id === "mug"))
    await reopenAccessAfterWonDispute(db, "pi_1")
    check("a second won event makes no second entry", tables.entitlements.length === 1)
  }
  {
    /* The same product bought twice: the other paid order keeps it. */
    const tables: Record<string, Row[]> = {
      orders: [
        { id: "a", buyer_id: "u1", product_id: "p", variant_id: null, status: "completed", amount_cents: 1000, stripe_payment_intent_id: "pi_a" },
        { id: "b", buyer_id: "u1", product_id: "p", variant_id: null, status: "completed", amount_cents: 1000, stripe_payment_intent_id: "pi_b" },
      ],
      entitlements: [{ id: "e", buyer_id: "u1", product_id: "p", variant_id: null }],
      products: [{ id: "p", creator_id: "c1", type: "digital" }],
    }
    const db = memoryDb(tables)
    await markPaymentDisputed(db, "pi_a")
    await closeAccessForDispute(db, "pi_a")
    check("a product also paid for on another order stays in the library", tables.entitlements.length === 1)
  }
  {
    /* Refunded in full before the dispute: nothing to give back when it is won. */
    const tables: Record<string, Row[]> = {
      orders: [{ id: "r", buyer_id: "u1", product_id: "p", variant_id: null, status: "refunded", amount_cents: 1000, refund_amount_cents: 1000, refunded_at: "2026-10-02", stripe_payment_intent_id: "pi_r" }],
      entitlements: [],
      products: [{ id: "p", creator_id: "c1", type: "digital" }],
    }
    const db = memoryDb(tables)
    await markPaymentDisputed(db, "pi_r")
    await restorePaymentAfterWonDispute(db, "pi_r")
    await reopenAccessAfterWonDispute(db, "pi_r")
    check("a row refunded in full is not put back in the library by a won dispute", tables.entitlements.length === 0 && tables.orders[0].status === "refunded")
  }
  {
    const hook = strip(read("app/api/stripe/webhook/route.ts"))
    const created = hook.slice(hook.indexOf('if (event.type === "charge.dispute.created") {'), hook.indexOf('if (event.type === "charge.dispute.closed") {'))
    const closedBlock = hook.slice(hook.indexOf('if (event.type === "charge.dispute.closed") {'), hook.indexOf('if (event.type === "charge.dispute.updated") {'))
    const updated = hook.slice(hook.indexOf('if (event.type === "charge.dispute.updated") {'))
    check("the webhook closes access when a chargeback opens", /if \(!inquiry\) await closeAccessForDispute\(supabaseAdmin, paymentIntentId/.test(created))
    check("and when an inquiry becomes one", /markPaymentDisputed\(supabaseAdmin, paymentIntentId\)\s*await closeAccessForDispute\(/.test(updated))
    check("and opens it again when one is won", /restorePaymentAfterWonDispute\(supabaseAdmin, piId\)\s*await reopenAccessAfterWonDispute\(supabaseAdmin, piId/.test(closedBlock))
    const awx = strip(read("lib/payments/airwallex/events.ts"))
    check("Airwallex disputes do the same", /closeAccessForDispute\(db, intentId, "provider_payment_id"/.test(awx) && /reopenAccessAfterWonDispute\(db, intentId, "provider_payment_id"/.test(awx))
  }

  console.log("\n2. Money on the seller's balance is in the wallet's currency")
  {
    const files = ["lib/memberships/sync.ts", "lib/checkout/fulfil-payment.ts", "lib/checkout/fulfil-cart-session.ts", "lib/physical/checkout-server.ts"]
    const calls = files.flatMap((f) => [...strip(read(f)).matchAll(/recordSale\(\w+, \{[^}]*\}\)/g)].map((m) => ({ f, call: m[0] })))
    const without = calls.filter((c) => !/currency:/.test(c.call))
    check("every sale written to the ledger names the currency it was paid in", calls.length >= 5 && without.length === 0, without)
    check("a membership's renewal is converted from the invoice's currency", /recordSale\(admin, \{[^}]*currency: invoice\.currency[^}]*\}\)/.test(strip(read("lib/memberships/sync.ts"))))
    const hook = strip(read("app/api/stripe/webhook/route.ts"))
    const dispute = hook.slice(hook.indexOf("const takeBack = async"), hook.indexOf('if (event.type === "charge.dispute.updated") {'))
    check("a dispute's hold is converted before it comes off the balance", /toLedger\(\[totalDeduction, disputeFeeCents\], disputeCurrency\)/.test(dispute) && /amountCents: walletDeduction/.test(dispute) && !/amountCents: totalDeduction/.test(dispute))
    check("and a won dispute's money goes back converted", /toLedger\(\[totalRestored\], disputeCurrency\)/.test(dispute) && /amountCents: walletRestored/.test(dispute) && !/amountCents: totalRestored/.test(dispute))
  }

  console.log("\n3. A corrected email reaches the order's checkout")
  {
    const tables: Record<string, Row[]> = {
      commerce_checkouts: [
        { id: "co1", creator_id: "c1", buyer_email: "ana@gmial.com" },
        { id: "co2", creator_id: "other", buyer_email: "x@y.com" },
      ],
    }
    const db = memoryDb(tables)
    const moved = await moveCheckoutEmail(db, [{ checkout_id: "co1" }, { checkout_id: "co1" }, { checkout_id: null }], "c1", "ana@gmail.com")
    check("the checkout of an order that ships takes the new address", moved === 1 && tables.commerce_checkouts[0].buyer_email === "ana@gmail.com")
    await moveCheckoutEmail(db, [{ checkout_id: "co2" }], "c1", "evil@x.com")
    check("never another creator's checkout", tables.commerce_checkouts[1].buyer_email === "x@y.com")
    check("a download's order has no checkout and nothing is written", (await moveCheckoutEmail(db, [{ checkout_id: null }, {}], "c1", "a@b.co")) === 0)
    check("the Orders page's email change moves it", /await moveCheckoutEmail\(admin, lines, creatorId, email\)/.test(strip(read("app/api/app/orders/[id]/email/route.ts"))))
    check("and the buyer's own change on the receipt", /await moveCheckoutEmail\(admin, \[order[^\]]*\], creatorId, newEmail\)/.test(strip(read("app/api/receipt/update-email/route.ts"))))
  }

  console.log("\n4. An order that ships writes money in its currency's own unit")
  {
    check("¥2500 is ¥2,500", formatMinor(2500, "JPY", "en-US") === "¥2,500", formatMinor(2500, "JPY", "en-US"))
    check("$25.00 stays $25.00", formatMinor(2500, "USD", "en-US") === "$25.00")
    const checkout = strip(read("lib/physical/checkout-server.ts"))
    check("the checkout's money() divides by the currency's own unit, not 100", /function money\([^)]*\): string \{\s*return formatMinor\(cents,/.test(checkout) && !/formatCurrency\(cents \/ 100/.test(checkout))
    const orders = strip(read("lib/physical/orders-server.ts"))
    check("the refund lines on the order's timeline too", !/refundedCents \/ 100\)\.toFixed\(2\)/.test(orders) && (orders.match(/formatMinor\(updated\.refundedCents,/g) ?? []).length === 2)
  }

  console.log("\n5. A returning customer's history is added to, on every path")
  {
    const hook = strip(read("app/api/stripe/webhook/route.ts"))
    check("the Checkout Session path no longer writes order_count 1 over the customer", !/order_count: 1,/.test(hook) && /await recordCustomer\(supabaseAdmin, \{ creatorId, email: buyerEmail/.test(hook))
    const customers = strip(read("app/app/customers/page.tsx"))
    check("Customers matches an order to its customer whatever the address's case", /sameEmail\(o\.buyer_email, email\)/.test(customers) && !/o\.buyer_email === email/.test(customers) && /toLowerCase\(\)/.test(customers))
  }

  console.log("\n6. What can be refunded, and by whom")
  {
    const line = (extra: Partial<OrderRow>): OrderRow => ({ id: "l", product_id: "p", amount_cents: 1000, status: "completed", created_at: "2026-10-01T00:00:00Z", stripe_payment_intent_id: "pi_1", ...extra }) as OrderRow
    check("a paid line can refund its whole amount", refundableCents(line({})) === 1000 && canRefundLine(line({})))
    const part = line({ status: "refunded", refund_amount_cents: 300 })
    check("a part refunded line can refund the rest (it could not)", refundableCents(part) === 700 && canRefundLine(part))
    check("a line refunded in full cannot", refundableCents(line({ status: "refunded", refund_amount_cents: 1000 })) === 0 && !canRefundLine(line({ status: "refunded", refund_amount_cents: 1000 })))
    check("an Airwallex sale can be refunded (it had no Refund)", canRefundLine(line({ stripe_payment_intent_id: null, provider: "airwallex", provider_payment_id: "int_abc" })))
    check("cash not yet collected cannot; collected can", !canRefundLine(line({ stripe_payment_intent_id: null, payment_method: "cash_on_delivery", physical_cash_due: true })) && canRefundLine(line({ stripe_payment_intent_id: null, payment_method: "cash_on_delivery", physical_cash_due: false })))
    check("a disputed, failed or free line cannot", !canRefundLine(line({ status: "disputed" })) && !canRefundLine(line({ status: "failed" })) && !canRefundLine(line({ amount_cents: 0 })))
    const [order] = groupOrders([part])
    check("the order still reads as part refunded", order.payment === "partially_refunded" && order.refundedCents === 300)
    const detail = strip(read("app/app/orders/order-detail.tsx"))
    check("the order page offers Refund on every line with money left", /const refundable = order\.lines\.filter\(canRefundLine\)/.test(detail))
    check("the dialog's amount is what is left, not the whole line", /const max = line \? refundableCents\(line\) \/ unit : 0/.test(detail))
    check("Cancel and refund sends back what is left of each line", /const cents = refundableCents\(line\)/.test(detail))
    check("a team member is not offered Refund on an order that ships", /<PhysicalFulfillment[^\n]*onRefund=\{canRefund && refundable\.length > 0/.test(detail))
    check("the list rows carry who took the payment", /provider: order\.provider \?\? null/.test(read("lib/orders/load-rows.ts")) && /provider_payment_id: order\.provider_payment_id \?\? null/.test(read("lib/orders/load-rows.ts")))
    const route = strip(read("app/api/stripe/refund/route.ts"))
    const client = strip(read("app/app/orders/orders-client.tsx"))
    check("a refund answers the line's running total, and the list shows it", /refundedCents: refundedTotal/.test(route) && /refund_amount_cents: typeof data\?\.refundedCents === "number" \? data\.refundedCents/.test(client))
  }

  console.log("\n7. Lists past the database's 1,000 row cap")
  {
    /* A database that, like Supabase, answers at most 1,000 rows a read, honouring range(). */
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: `co${String(i).padStart(5, "0")}`, creator_id: `c${i % 1300}` }))
    const capped = {
      from(table: string) {
        let lo = 0
        let hi = Infinity
        const b: any = {}
        for (const op of ["select", "eq", "in", "is", "lt", "order"]) b[op] = () => b
        b.limit = (n: number) => ((hi = n - 1), b)
        b.range = (from: number, to: number) => ((lo = from), (hi = to), b)
        b.then = (ok: (v: unknown) => unknown) => {
          if (table === "creators") return Promise.resolve(ok({ data: Array.from({ length: 1300 }, (_, i) => ({ id: `c${i}`, user_id: `u${i}` })).slice(0, 200), error: null }))
          const end = Math.min(hi, lo + 999)
          return Promise.resolve(ok({ data: all.slice(lo, end + 1), error: null }))
        }
        return b
      },
    }
    const { storesWithOrdersWaiting } = await import("../lib/physical/orders-waiting-server")
    const stores = await storesWithOrdersWaiting(capped, Date.parse("2026-10-13T14:05:00Z"))
    const counted = stores.reduce((n, s) => n + s.count, 0)
    check("the daily reminder counts every waiting order, not the first thousand", counted === 400, { counted, stores: stores.length })
    const exp = strip(read("app/api/physical/orders/export/route.ts"))
    check("the orders-to-ship CSV reads every page, not a capped limit(5000)", !/\.limit\(5000\)/.test(exp) && /\.range\(from, from \+ EXPORT_PAGE - 1\)/.test(exp))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

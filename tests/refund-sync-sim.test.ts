/**
 * syncChargeRefund against an in-memory database and Stripe, in the cases
 * the review found: a basket refunded in the dashboard, the same event
 * delivered twice, a refund the Orders page check already wrote to the row,
 * a delivery that failed halfway, and a refund started from the Orders page.
 */
import { syncChargeRefund } from "../lib/stripe/refund-sync"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

type Row = Record<string, any>
function memoryDb(tables: Record<string, Row[]>, opts: { failEventInsertOnce?: boolean } = {}) {
  let failOnce = !!opts.failEventInsertOnce
  const from = (name: string) => {
    const rows = (tables[name] ||= [])
    const filters: Array<(r: Row) => boolean> = []
    let mode: "select" | "update" | "delete" = "select"
    let patch: Row = {}
    const api: any = {
      select: () => api,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), api),
      limit: () => api,
      update: (p: Row) => ((mode = "update"), (patch = p), api),
      delete: () => ((mode = "delete"), api),
      maybeSingle: async () => ({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      insert: async (row: Row) => {
        if (name === "ledger_events" && failOnce) { failOnce = false; return { error: { message: "network" } } }
        if (name === "ledger_events" && row.event_type === "refund" && rows.some((r) => r.event_type === "refund" && r.stripe_refund_id === row.stripe_refund_id && r.order_id === row.order_id)) {
          return { error: { code: "23505", message: "duplicate" } }
        }
        rows.push({ ...row }); return { error: null }
      },
      then: (resolve: (v: unknown) => void) => {
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        if (mode === "update") hit.forEach((r) => Object.assign(r, patch))
        if (mode === "delete") hit.forEach((r) => rows.splice(rows.indexOf(r), 1))
        resolve({ data: hit.map((r) => ({ ...r })), error: null })
      },
    }
    return api
  }
  return { from }
}
const stripeWith = (refunds: Row[]) => ({ refunds: { list: async () => ({ data: refunds }) } }) as any
const charge = (id = "ch_1") => ({ id, payment_intent: "pi_1", currency: "usd", refunds: { data: [] } }) as any
const order = (id: string, amount: number, extra: Row = {}) => ({ id, amount_cents: amount, status: "completed", product_id: "p1", buyer_id: "u1", variant_id: null, stripe_payment_intent_id: "pi_1", created_at: `2026-09-01T00:00:0${id.length}Z`, ...extra })
const base = (orders: Row[]) => ({
  orders,
  products: [{ id: "p1", creator_id: "c1", title: "Pack" }],
  seller_ledger: [{ creator_id: "c1", pending_amount: 0, available_amount: 10000, negative_balance: 0, lifetime_refunds: 0 }],
  ledger_events: orders.map((o) => ({ event_type: "sale", order_id: o.id, fee_cents: Math.round(o.amount_cents * 0.06), released_at: "2026-09-02" })),
  entitlements: [{ buyer_id: "u1", product_id: "p1", variant_id: null }],
  profiles: [],
})
const refundEvents = (t: Record<string, Row[]>) => t.ledger_events.filter((e) => e.event_type === "refund")

async function main() {
  console.log("\nA basket refunded in full in the dashboard")
  {
    const t = base([order("a", 1000), order("bb", 2000)])
    const r = await syncChargeRefund(memoryDb(t), stripeWith([{ id: "re_1", amount: 3000, status: "succeeded", created: 1, metadata: {} }]), charge())
    check("both rows refunded in full", t.orders.every((o) => o.status === "refunded") && t.orders[0].refund_amount_cents === 1000 && t.orders[1].refund_amount_cents === 2000, t.orders)
    check("one event per row, adding up to the refund", refundEvents(t).length === 2 && refundEvents(t).reduce((n, e) => n + e.amount_cents, 0) === 3000)
    check("the balance gives back what the seller received, from available once released", t.seller_ledger[0].available_amount === 10000 - (3000 - 180), t.seller_ledger[0])
    check("the product leaves the library", t.entitlements.length === 0)
    const again = await syncChargeRefund(memoryDb(t), stripeWith([{ id: "re_1", amount: 3000, status: "succeeded", created: 1, metadata: {} }]), charge())
    check("delivered again, nothing changes", again.applied === 0 && refundEvents(t).length === 2 && t.seller_ledger[0].available_amount === 10000 - 2820, again)
  }

  console.log("\nThe review's case: A refunded from the page, then B in the dashboard, then a redelivery")
  {
    const t = base([order("a", 1000), order("bb", 1000)])
    const page = { id: "re_0", amount: 1000, status: "succeeded", created: 1, metadata: { order_id: "a", creator_id: "c1" } }
    t.orders[0].status = "refunded"; t.orders[0].refund_amount_cents = 1000; t.orders[0].stripe_refund_id = "re_0"
    const dash = { id: "re_1", amount: 1000, status: "succeeded", created: 2, metadata: {} }
    await syncChargeRefund(memoryDb(t), stripeWith([page, dash]), charge())
    const after = t.seller_ledger[0].available_amount
    check("each refund lands on its own row", refundEvents(t).find((e) => e.stripe_refund_id === "re_0")?.order_id === "a" && refundEvents(t).find((e) => e.stripe_refund_id === "re_1")?.order_id === "bb", refundEvents(t))
    await syncChargeRefund(memoryDb(t), stripeWith([page, dash]), charge())
    check("a redelivery applies nothing twice", refundEvents(t).length === 2 && t.seller_ledger[0].available_amount === after)
    check("the page's refund kept the amount it wrote", t.orders[0].refund_amount_cents === 1000 && t.orders[0].stripe_refund_id === "re_0")
  }

  console.log("\nA partial refund the Orders page check already wrote to the row")
  {
    const t = base([order("a", 1000, { status: "refunded", refund_amount_cents: 500 })])
    await syncChargeRefund(memoryDb(t), stripeWith([{ id: "re_1", amount: 500, status: "succeeded", created: 1, metadata: {} }]), charge())
    check("it stays a $5 refund of a $10 order", t.orders[0].refund_amount_cents === 500, t.orders[0])
    check("and the buyer keeps the product", t.entitlements.length === 1)
  }

  console.log("\nA delivery that fails halfway")
  {
    const t = base([order("a", 1000), order("bb", 1000)])
    const refunds = [{ id: "re_1", amount: 1000, status: "succeeded", created: 1, metadata: {} }]
    let threw = false
    try { await syncChargeRefund(memoryDb(t, { failEventInsertOnce: true }), stripeWith(refunds), charge()) } catch { threw = true }
    check("it throws, so the webhook answers 500 and Stripe retries", threw)
    await syncChargeRefund(memoryDb(t), stripeWith(refunds), charge())
    check("the retry finishes it, adding up to the refund exactly", refundEvents(t).reduce((n, e) => n + e.amount_cents, 0) === 1000, refundEvents(t))
  }

  console.log("\nA partial refund while the sale is still held")
  {
    const t = base([order("a", 1000)])
    t.ledger_events[0].released_at = null
    t.seller_ledger[0].pending_amount = 940
    await syncChargeRefund(memoryDb(t), stripeWith([{ id: "re_1", amount: 500, status: "succeeded", created: 1, metadata: {} }]), charge())
    check("it comes out of pending, with half the fee kept back", t.seller_ledger[0].pending_amount === 940 - 470 && t.seller_ledger[0].available_amount === 10000, t.seller_ledger[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main()

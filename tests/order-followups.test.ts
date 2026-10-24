/**
 * ===========================================================================
 *  A PAID ORDER'S FOLLOW-UPS ARE FINISHED AFTER A CRASH, AND NEVER TWICE
 * ===========================================================================
 * Before: the caller whose insert wrote the order did everything after it
 * (customer, library entry, sales count, ledger, emails). When that caller
 * died after the insert, every retry found the order and stopped, and none
 * of it ever happened. Now each step is recorded in order_followups (run-now
 * part 300) and a retry, or the ten minute sweep, runs what is missing:
 * idempotent steps unless done, once steps only if nobody claimed them.
 *
 * Also held here (round AE):
 *   a buyer with two copies of an entitlement got a third, because
 *     maybeSingle() errors on two rows and the error read as "none"
 *   a dispute step that failed was answered 200, so Stripe never retried
 *   "Connect payments" stayed on the store's checklist up to a minute after
 *     Stripe connected, because nothing cleared the readiness cache
 *
 *   npx tsx --conditions=react-server tests/order-followups.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { beginFollowups, IN_FLIGHT_MS, resumeFollowups, unfinishedFollowups } from "../lib/checkout/followups"
import { fulfilPaidCheckout } from "../lib/checkout/fulfil-payment"
import type { PaidCheckout } from "../lib/payments/checkout"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const UNIQUE = { order_followups: [["order_id", "step"]] }

async function main() {
  console.log("\n1. The record of steps")
  {
    const db = fakeDb({ order_followups: [] }, { unique: UNIQUE })
    const t0 = Date.parse("2026-10-24T10:00:00Z")
    const f = await beginFollowups(db as never, "o1", { kind: "payment", ref: "pi_1", log: "test" }, () => t0)
    check("the table is there: steps are recorded", f.available)
    let idem = 0
    let once = 0
    await f.idempotent("ledger", async () => void idem++)
    await f.once("emails", async () => void once++)
    await f.once("customer", async () => {
      throw new Error("database blip")
    })
    await f.finish()
    const state = (step: string) => db.tables.order_followups.find((r) => r.order_id === "o1" && r.step === step)?.state
    check("an idempotent step ran and is done", idem === 1 && state("ledger") === "done")
    check("a once step ran and is done", once === 1 && state("emails") === "done")
    check("a step that threw is failed, and the order is not complete", state("customer") === "failed" && state("complete") === undefined && f.failed.includes("customer"))
    check("a retry inside the first run's window leaves it alone", (await resumeFollowups(db as never, "o1", { log: "test" }, () => t0 + 60_000)) === null)
    const later = () => t0 + IN_FLIGHT_MS + 60_000
    check("the sweep finds it once the window has passed", (await unfinishedFollowups(db as never, 10, later)).some((d) => d.orderId === "o1" && d.kind === "payment" && d.ref === "pi_1"))
    const r = await resumeFollowups(db as never, "o1", { log: "test" }, later)
    check("a later retry resumes it", r !== null)
    let again = { idem: 0, once: 0, customer: 0 }
    await r!.idempotent("ledger", async () => void again.idem++)
    await r!.once("emails", async () => void again.once++)
    await r!.once("customer", async () => void again.customer++)
    await r!.finish()
    check("  done steps do not run again: no second email, no second ledger post", again.idem === 0 && again.once === 0)
    check("  the failed step runs again, and the order is complete", again.customer === 1 && state("customer") === "done" && state("complete") === "done")
    check("  and then nothing resumes it", (await resumeFollowups(db as never, "o1", { log: "test" }, () => later() + IN_FLIGHT_MS * 2)) === null)
    check("  nor does the sweep find it", (await unfinishedFollowups(db as never, 10, () => later() + IN_FLIGHT_MS * 2)).length === 0)

    /* A caller that died inside a once step: it may have run. Never a second time. */
    db.tables.order_followups.push({ order_id: "o2", step: "begun", state: "claimed", kind: "payment", ref: "pi_2", attempts: 1, created_at: new Date(t0).toISOString(), updated_at: new Date(t0).toISOString() })
    db.tables.order_followups.push({ order_id: "o2", step: "emails", state: "claimed", created_at: new Date(t0).toISOString(), updated_at: new Date(t0).toISOString() })
    const r2 = await resumeFollowups(db as never, "o2", { log: "test" }, later)
    let sent = 0
    await r2!.once("emails", async () => void sent++)
    check("a once step claimed by a caller that died is never run again (no double email)", sent === 0)

    /* Two callers resuming at once: the claim lets one of them have a once step. */
    db.tables.order_followups.push({ order_id: "o3", step: "begun", state: "claimed", kind: "payment", ref: "pi_3", attempts: 1, created_at: new Date(t0).toISOString(), updated_at: new Date(t0).toISOString() })
    const a = await resumeFollowups(db as never, "o3", { log: "test", force: true }, later)
    const b = await resumeFollowups(db as never, "o3", { log: "test", force: true }, later)
    let count = 0
    await Promise.all([a!.once("sales count", async () => void count++), b!.once("sales count", async () => void count++)])
    check("two resumes at once count the sale once", count === 1, count)

    /* Before part 300: no table. The first writer runs everything as it always did; a retry does nothing more. */
    const bare = fakeDb({}, { failWith: { order_followups: { code: "42P01", message: 'relation "public.order_followups" does not exist' } } })
    const g = await beginFollowups(bare as never, "o9", { kind: "payment", ref: "pi_9", log: "test" })
    let ran = 0
    await g.once("emails", async () => void ran++)
    await g.idempotent("ledger", async () => void ran++)
    await g.finish()
    check("before part 300 the first writer still runs every step", !g.available && ran === 2)
    check("  and a retry resumes nothing, as before", (await resumeFollowups(bare as never, "o9", { log: "test" })) === null)
  }

  console.log("\n2. A single product order whose writer died right after the insert")
  {
    const CREATOR = "c-1"
    const PRODUCT = "p-1"
    const BUYER = "b-1"
    const created = Date.parse("2026-10-24T10:00:00Z")
    const paid: PaidCheckout = {
      provider: "stripe",
      paymentId: "pi_crash",
      amountMinor: 2500,
      currency: "usd",
      metadata: { product_id: PRODUCT, creator_id: CREATOR, receipt_token: "rt_crash", buyer_id: BUYER, buyer_email: "ana@example.com", buyer_first_name: "Ana", product_title: "Glaze notebook", platform_fee_cents: "100" },
      receiptEmail: "ana@example.com",
      createdSeconds: Math.floor(created / 1000),
      facts: { paymentMethod: "card", cardBrand: "visa", cardLast4: "4242", paypalEmail: null, applicationFeeCents: 100, transferId: null, destinationPaymentId: null, chargeId: null },
    }
    const old = new Date(Date.now() - IN_FLIGHT_MS - 120_000).toISOString()
    const db = fakeDb(
      {
        /* What the first writer left: the order, and that its follow-ups began. Then it died. */
        orders: [{ id: "o-crash", receipt_token: "rt_crash", stripe_payment_intent_id: "pi_crash", session_fingerprint: null, amount_cents: 2500, created_at: old, product_id: PRODUCT, status: "completed", currency: "usd" }],
        order_followups: [{ order_id: "o-crash", step: "begun", state: "claimed", kind: "payment", ref: "pi_crash", attempts: 1, created_at: old, updated_at: old }],
        products: [{ id: PRODUCT, title: "Glaze notebook", creator_id: CREATOR }],
        creators: [{ id: CREATOR, user_id: "u-1" }],
        customers: [],
        /* Two copies of the same entitlement, as some buyers have: maybeSingle() errors on these. */
        entitlements: [
          { id: "e1", buyer_id: BUYER, product_id: PRODUCT, variant_id: null, creator_id: CREATOR },
          { id: "e2", buyer_id: BUYER, product_id: PRODUCT, variant_id: null, creator_id: CREATOR },
        ],
        seller_ledger: [],
        ledger_events: [],
        analytics_events: [],
      },
      { unique: { ...UNIQUE, orders: [["receipt_token"]] } },
    )
    const first = await fulfilPaidCheckout(db as never, paid, { baseUrl: "https://storelib.com" })
    check("the retry answers with the order that exists", first.ok === true && (first as { orderId: string }).orderId === "o-crash" && (first as { created: boolean }).created === false)
    check("  and did not write a second order", db.tables.orders.length === 1)
    const steps = new Map(db.tables.order_followups.filter((r) => r.order_id === "o-crash").map((r) => [r.step, r.state]))
    check("the customer the crash lost is written now", db.tables.customers.length === 1 && db.tables.customers[0].order_count === 1 && steps.get("customer") === "done", db.tables.customers)
    check("the seller's ledger has the sale now", db.tables.ledger_events.filter((e) => e.event_type === "sale" && e.order_id === "o-crash").length === 1 && steps.get("ledger") === "done")
    check("the sales count and the email steps ran and are recorded", steps.get("sales count") === "done" && steps.get("emails") === "done" && db.tables.analytics_events.length === 1)
    check("the library entry is checked by any row: two copies stay two, no third (it used to add one)", db.tables.entitlements.length === 2 && steps.get("entitlement") === "done", db.tables.entitlements.length)

    /* Every step is recorded now, so another delivery changes nothing, whatever the clock. */
    for (const r of db.tables.order_followups) if (r.order_id === "o-crash") r.updated_at = old
    const second = await fulfilPaidCheckout(db as never, paid, { baseUrl: "https://storelib.com" })
    check("a second retry answers the same order", second.ok === true && (second as { orderId: string }).orderId === "o-crash")
    check("  and repeats nothing: one customer order, one ledger sale, one sales count", db.tables.customers[0].order_count === 1 && db.tables.ledger_events.filter((e) => e.event_type === "sale").length === 1 && db.tables.analytics_events.length === 1)
  }

  console.log("\n3. Every checkout type records its steps, and the sweep runs")
  {
    const payment = read("lib/checkout/fulfil-payment.ts")
    check("single product: the first writer begins, a retry that finds the order resumes", /beginFollowups\(admin, order\.id, \{ kind: "payment", ref: paid\.paymentId/.test(payment) && /if \(found\) \{\s*const resumed = await resumeFollowups\(admin, found\.id/.test(payment))
    check("  emails, customer, contact, sales count, code and push are claimed once", ["customer", "contact", "sales count", "coupon use", "emails", "push"].every((s) => payment.includes(`f.once("${s}"`)))
    check("  the ledger is idempotent (keyed per order in the database)", /f\.idempotent\("ledger", \(\) => recordSale/.test(payment))
    const cart = read("lib/checkout/fulfil-cart-session.ts")
    check("baskets: each written line begins, each line another caller wrote resumes", /beginFollowups\(admin, outcome\.line\.orderId, \{ kind, ref: ctx\.sessionId/.test(cart) && /resumeFollowups\(admin, outcome\.orderId/.test(cart))
    check("  the basket's emails and customer go with its first line, once", /once\("customer"/.test(cart) && /once\("buyer email"/.test(cart) && /line\.f\.once\("seller email"/.test(cart))
    check("  a line written over the sales limit is never granted on a resume", /soldOut: row\?\.refund_reason === SOLD_OUT_REASON/.test(read("lib/checkout/fulfil-cart-item.ts")))
    const physical = read("lib/physical/checkout-server.ts")
    check("things that ship: the same, keyed by the checkout", /beginFollowups\(db, order\.id, \{ kind: "physical", ref: c\.checkoutId/.test(physical) && /resumeFollowups\(db, String\(row\.id\)/.test(physical) && /onceForOrder\(db, basket, \{/.test(physical))
    check("  and its library entry reads any row too", /const \{ data: has \} = await q\.limit\(1\)/.test(physical) && !/const \{ data: has \} = await q\.maybeSingle\(\)/.test(physical))
    check("the cart line's library entry reads any row", /const \{ data: existing \} = await q\.limit\(1\)/.test(read("lib/checkout/fulfil-cart-item.ts")))
    const cron = read("app/api/cron/physical/route.ts")
    check("the ten minute sweep finishes unfinished orders, physical commerce on or off", cron.indexOf("runFollowupSweep(db") > 0 && cron.indexOf("runFollowupSweep(db") < cron.indexOf("isPhysicalCommerceEnabled()"))
    const sql = read("supabase/sql/run-now/300_order_followups.sql")
    check("run-now part 300: a new table only, row level security on, safe to run again", /CREATE TABLE IF NOT EXISTS public\.order_followups/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && !/\b(DROP|DELETE|TRUNCATE|ALTER TABLE public\.orders)\b/i.test(sql))
    check("  the same as the migration, in the README and the check after", sql === read("supabase/migrations/20270201_ae1_order_followups.sql") && read("supabase/sql/run-now/README.md").includes("`300_order_followups.sql`") && /* Changed on purpose: part 301 follows it in the after-check. */ /as p300_order_followups[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\n4. A dispute step that fails is answered 500, so Stripe sends it again")
  {
    const hook = read("app/api/stripe/webhook/route.ts")
    const block = hook.slice(hook.indexOf('event.type === "charge.dispute.created" ||'), hook.indexOf("/** An amount for a ledger line"))
    check("the catch answers 500, not 200", /catch \(error: any\) \{[\s\S]{0,400}status: 500/.test(block))
    check("orders not marked or not restored is a failure, not a log line", (block.match(/throw markErr/g) ?? []).length === 2 && /throw restoreErr/.test(block))
    check("a retried close does not return early: the money is skipped once written, the rest finished", !/Dispute close already processed/.test(block) && /const moneyDone = !!existingClosed/.test(block) && /if \(!moneyDone\) \{\s*const reversed/.test(block) && /if \(!inquiry && !moneyDone\)/.test(block))
    check("  the opening take back is once per dispute (its ledger event and the reversal's own key)", /\.eq\("event_type", "dispute_created"\)/.test(block) && /idempotencyKey: `storelib:dispute:\$\{dispute\.id\}:reversal`/.test(read("lib/stripe/disputes.ts")))
  }

  console.log("\n5. Connect payments leaves the checklist at once")
  {
    const cache = read("lib/payments/stripe/readiness-cache.ts")
    check("one helper clears the store's readiness cache", /clearReadiness\(creatorId\)/.test(cache))
    check("account.updated and capability.updated clear it when ready changes", /if \(wasReady !== nowReady\) await forgetPaymentsReadiness\(creatorId\)/.test(read("lib/stripe/connect-webhook.ts")))
    check("the return from Stripe's setup clears it", /syncStripeAccountFull\(creator\.id, "creator"\)\s*\/\*[^*]*\*\/\s*await forgetPaymentsReadiness\(creator\.id\)/.test(read("app/api/stripe/connect/status/route.ts")))
    check("the overview's sync clears it when ready changed", /forgetPaymentsReadiness\(creator\.id\)/.test(read("lib/payments/stripe/overview.ts")))
    check("every disconnect clears it", /await noteAccountReset\(creatorId, previousAccountId, reason\)\s*\/\*[^*]*\*\/\s*await forgetPaymentsReadiness\(creatorId\)/.test(read("lib/payments/stripe/connect.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("Failed:\n" + failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.log(`  FAIL  threw: ${(e as Error).stack}`)
  process.exit(1)
})

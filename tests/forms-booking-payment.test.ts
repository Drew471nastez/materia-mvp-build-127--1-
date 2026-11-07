/**
 * A booking paid with a product: the booking token in the checkout
 * metadata and back, the webhook confirming it once, a duplicate event,
 * a wrong amount, product or currency, a failed and a refunded payment,
 * and an unpaid hold that runs out. Against an in-memory table with the
 * same filters supabase-js sends.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-only-key-for-booking-payments"

let passed = 0
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn()
  passed++
  console.log("ok -", name)
}

type Row = Record<string, any>
function fakeDb(rows: Row[]) {
  return {
    from(table: string) {
      assert.equal(table, "form_bookings")
      let patch: Row | null = null
      const filters: ((r: Row) => boolean)[] = []
      let single = false
      const run = () => {
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        if (patch) for (const r of hit) Object.assign(r, patch)
        const data = single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r }))
        return { data, error: null }
      }
      const q: any = {
        select: () => q,
        update: (v: Row) => ((patch = v), q),
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        lt: (k: string, v: string) => (filters.push((r) => r[k] !== null && r[k] < v), q),
        maybeSingle: () => ((single = true), q),
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return q
    },
  }
}

async function main() {
  const { bookingCheckoutToken, readBookingToken, prepareBookingCheckout, applyBookingPayment, applyBookingFailure, applyBookingRefund, expireUnpaidBookings, paymentVerdict, BOOKING_METADATA_KEY, BOOKING_AMOUNT_KEY } = await import("../lib/forms/booking-payment")
  const PRODUCT = "aaaaaaaa-0000-4000-8000-0000000000a1"
  const OTHER = "aaaaaaaa-0000-4000-8000-0000000000a2"
  const BOOKING = "bbbbbbbb-0000-4000-8000-0000000000b1"
  const now = Date.parse("2026-06-01T10:00:00Z")
  const fresh = (): Row => ({
    id: BOOKING,
    owner_id: "owner",
    form_id: "form",
    submission_id: "sub",
    status: "pending",
    payment_status: "unpaid",
    payment_product_id: PRODUCT,
    payment_due_at: new Date(now + 30 * 60_000).toISOString(),
    payment_amount_cents: null,
    payment_currency: null,
    payment_intent_id: null,
    created_at: new Date(now).toISOString(),
  })
  const intent = (meta: Record<string, string>, over: Partial<{ amount_received: number; currency: string; id: string; status: string }> = {}) => ({
    id: "pi_1",
    status: "succeeded",
    amount: 4500,
    amount_received: 4500,
    currency: "eur",
    metadata: { product_id: PRODUCT, ...meta },
    ...over,
  })

  await check("the booking token round-trips for its product only, and tampering fails", () => {
    const token = bookingCheckoutToken(BOOKING, PRODUCT)
    assert.equal(readBookingToken(token, PRODUCT), BOOKING)
    assert.equal(readBookingToken(token, OTHER), null)
    assert.equal(readBookingToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), PRODUCT), null)
    assert.equal(readBookingToken(BOOKING, PRODUCT), null)
    assert.equal(readBookingToken(`${OTHER}.${token.split(".")[1]}`, PRODUCT), null)
  })

  await check("checkout records the amount and currency, and puts the booking in the metadata", async () => {
    const rows = [fresh()]
    const done = await prepareBookingCheckout(fakeDb(rows), { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "EUR", now })
    assert.equal(done.ok, true)
    const meta = (done as { metadata: Record<string, string> }).metadata
    assert.deepEqual(meta, { [BOOKING_METADATA_KEY]: BOOKING, [BOOKING_AMOUNT_KEY]: "4500" })
    assert.equal(rows[0].payment_amount_cents, 4500)
    assert.equal(rows[0].payment_currency, "eur")
    assert.ok(Date.parse(rows[0].payment_due_at) >= now + 15 * 60_000)
    /* Another product's checkout cannot carry it. */
    const other = await prepareBookingCheckout(fakeDb(rows), { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: OTHER, chargeCents: 4500, currency: "eur", now })
    assert.equal(other.ok, false)
  })

  await check("the webhook confirms a matching payment once and queues one email; a duplicate event changes nothing", async () => {
    const rows = [fresh()]
    const db = fakeDb(rows)
    const prepared = await prepareBookingCheckout(db, { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "eur", now })
    const meta = (prepared as { metadata: Record<string, string> }).metadata
    let emails = 0
    const queue = async () => void emails++
    assert.equal((await applyBookingPayment(db, intent(meta), queue)).kind, "confirm")
    assert.equal(rows[0].status, "confirmed")
    assert.equal(rows[0].payment_status, "paid")
    assert.equal(rows[0].payment_intent_id, "pi_1")
    assert.equal((await applyBookingPayment(db, intent(meta), queue)).kind, "duplicate")
    assert.equal((await applyBookingPayment(db, intent(meta), queue)).kind, "duplicate")
    assert.equal(emails, 1, "the visitor is emailed once")
    /* A second, different payment for the same booking is flagged, not applied. */
    assert.equal((await applyBookingPayment(db, intent(meta, { id: "pi_2" }), queue)).kind, "review")
    assert.equal(rows[0].payment_intent_id, "pi_1")
  })

  await check("a wrong amount, product or currency never confirms", async () => {
    for (const [name, pi] of [
      ["short amount", (m: Record<string, string>) => intent(m, { amount_received: 4499 })],
      ["metadata amount changed", (m: Record<string, string>) => intent({ ...m, [BOOKING_AMOUNT_KEY]: "100" })],
      ["another product", (m: Record<string, string>) => intent({ ...m, product_id: OTHER })],
      ["another currency", (m: Record<string, string>) => intent(m, { currency: "usd" })],
    ] as const) {
      const rows = [fresh()]
      const db = fakeDb(rows)
      const meta = ((await prepareBookingCheckout(db, { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "eur", now })) as { metadata: Record<string, string> }).metadata
      let emails = 0
      const verdict = await applyBookingPayment(db, pi(meta), async () => void emails++)
      assert.equal(verdict.kind, "review", name)
      assert.equal(rows[0].status, "pending", name)
      assert.equal(rows[0].payment_status, "review", name)
      assert.equal(emails, 0, name)
    }
    /* A booking with no recorded amount (no checkout started) cannot be confirmed by a payment either. */
    assert.equal(paymentVerdict(fresh() as never, intent({ [BOOKING_METADATA_KEY]: BOOKING, [BOOKING_AMOUNT_KEY]: "4500" })).kind, "review")
  })

  await check("a failed payment is not a confirmation; a full refund cancels a paid booking", async () => {
    const rows = [fresh()]
    const db = fakeDb(rows)
    const meta = ((await prepareBookingCheckout(db, { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "eur", now })) as { metadata: Record<string, string> }).metadata
    assert.equal(await applyBookingFailure(db, { id: "pi_1", metadata: meta }), true)
    assert.equal(rows[0].status, "pending")
    assert.equal(rows[0].payment_status, "failed")
    assert.equal(paymentVerdict(rows[0] as never, intent(meta, { status: "processing" })).kind, "ignore")
    /* A retry with another card succeeds. */
    assert.equal((await applyBookingPayment(db, intent(meta), async () => {})).kind, "confirm")
    assert.equal(await applyBookingRefund(db, "pi_1"), true)
    assert.equal(rows[0].status, "cancelled")
    assert.equal(rows[0].payment_status, "refunded")
    assert.equal(await applyBookingRefund(db, "pi_1"), false, "a repeated refund event changes nothing")
  })

  await check("an unpaid hold that runs out is cancelled, freeing the slot; checkout then refuses it", async () => {
    const rows = [fresh(), { ...fresh(), id: "paid", payment_status: "paid", status: "confirmed" }, { ...fresh(), id: "nopay", payment_status: "none", payment_due_at: null }]
    const db = fakeDb(rows)
    assert.equal(await expireUnpaidBookings(db, new Date(now + 10 * 60_000).toISOString()), 0, "not before its time")
    assert.equal(await expireUnpaidBookings(db, new Date(now + 31 * 60_000).toISOString()), 1)
    assert.equal(rows[0].status, "cancelled")
    assert.equal(rows[1].status, "confirmed")
    assert.equal(rows[2].status, "pending")
    const late = await prepareBookingCheckout(db, { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "eur", now: now + 32 * 60_000 })
    assert.equal(late.ok, false)
    /* The hold also refuses checkout by time alone, before the sweep runs. */
    const unswept = [fresh()]
    assert.equal((await prepareBookingCheckout(fakeDb(unswept), { token: bookingCheckoutToken(BOOKING, PRODUCT), productId: PRODUCT, chargeCents: 4500, currency: "eur", now: now + 31 * 60_000 })).ok, false)
  })

  await check("a payment that lands after the hold ran out confirms only if the time is still free", async () => {
    const rows = [{ ...fresh(), status: "cancelled", payment_amount_cents: 4500, payment_currency: "eur" }]
    let emails = 0
    const meta = { [BOOKING_METADATA_KEY]: BOOKING, [BOOKING_AMOUNT_KEY]: "4500" }
    assert.equal((await applyBookingPayment(fakeDb(rows), intent(meta), async () => void emails++)).kind, "confirm")
    assert.equal(rows[0].status, "confirmed")
    assert.equal(emails, 1)
  })

  await check("the existing checkout and webhook carry it: no second endpoint", () => {
    const session = readFileSync("app/api/checkout/stripe-session/route.ts", "utf8")
    assert.ok(session.indexOf("prepareBookingCheckout(") > 0 && session.indexOf("prepareBookingCheckout(") < session.indexOf("fitStripeMetadata(metadata)"), "booking keys are added before Stripe's key limit is checked")
    const hook = readFileSync("app/api/stripe/webhook/route.ts", "utf8")
    const succeeded = hook.indexOf('if (event.type === "payment_intent.succeeded")')
    assert.ok(hook.indexOf("bookingPaid(", succeeded) > succeeded && hook.indexOf("bookingPaid(", succeeded) < hook.indexOf("isCartIntent(pi)", succeeded))
    assert.match(hook, /bookingPaymentFailed\(/)
    assert.match(hook, /bookingRefunded\(supabaseAdmin, intentId\)/)
    assert.match(readFileSync("app/(storelib)/checkout/checkout-client.tsx", "utf8"), /booking: searchParams\.get\("booking"\)/)
    assert.match(readFileSync("app/api/forms/[id]/submit/route.ts", "utf8"), /bookingCheckoutToken\(booking\.id, product\)/)
    assert.match(readFileSync("lib/forms/delivery-server.ts", "utf8"), /expireUnpaidBookings\(db/)
    const sql = readFileSync("supabase/migrations/20271130_forms_bookings.sql", "utf8")
    for (const col of ["payment_status", "payment_due_at", "payment_amount_cents", "payment_currency", "payment_intent_id", "paid_at", "payment_note"]) assert.match(sql, new RegExp(`add column if not exists ${col}\\b`))
    assert.match(sql, /now\(\) \+ interval '30 minutes'/)
  })

  console.log(`forms-booking-payment: ${passed} passed`)
}
void main().catch((e) => {
  console.error(e)
  process.exit(1)
})

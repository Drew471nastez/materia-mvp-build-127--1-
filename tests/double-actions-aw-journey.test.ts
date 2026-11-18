/**
 * ===========================================================================
 *  ROUND AW, TRACK F, THROUGH THE REAL ROUTES (tests/_journey, strict)
 * ===========================================================================
 * The routes themselves, over the in-memory PostgREST and a Stripe world that
 * keeps idempotency keys and the charge's own refund limit. The pure parts,
 * the community refund and the paid order's second writer are in
 * tests/double-actions-aw.test.ts.
 *
 *   REFUND AGAIN   Orders > Refund for part of an order, pressed again after
 *                  its answer was lost: refused (409) with what the order
 *                  holds, one refund at Stripe. A second refund on the figure
 *                  the page now shows goes through; a page from before this
 *                  round (no figure) refunds as it did.
 *   CLAIM AGAIN    Get it free (app/api/checkout/process) and a OnePage's
 *                  free product (quick-free) sent again with the same attempt
 *                  id: one order, one receipt email, a one use code used once
 *                  and the answer that order, not "used up".
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { instantOrderBody } from "../lib/onepage/product-block"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const BANNED = /unlock|elevate|seamless|powerful|effortlessly|supercharge|transform|—/i

function newProduct(j: Journey, creatorId: string, p: { title: string; priceCents: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: "digital", title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

async function main() {
  const j = await Journey.start()
  const seller = await j.signUp("maker-aw@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara-aw" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })

  console.log("\n1. Orders > Refund pressed again after its answer was lost: one refund")
  const kit = newProduct(j, creator.id as string, { title: "Drum Kit", priceCents: 2000 })
  const started = await j.call("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: kit, email: "bea@example.com", name: "Bea Buyer" }, false), headers: { "x-forwarded-for": "198.51.100.1" } })
  if (started.json?.paymentIntentId) j.world.payIntent(started.json.paymentIntentId)
  await j.call("POST /api/checkout/confirm-payment", { body: { paymentIntentId: started.json?.paymentIntentId, clientSecret: started.json?.clientSecret } })
  const sold = j.rows("orders").find((o) => o.buyer_email === "bea@example.com")
  check("a paid order of 20.00 to refund", !!sold && sold.amount_cents === 2000 && sold.status === "completed", sold && { amount: sold.amount_cents, status: sold.status })
  const refunded = () => [...j.world.charges.values()].reduce((n, c) => n + (Number(c.amount_refunded) || 0), 0)
  const press = { orderId: sold?.id, amount: 5, reason: "requested_by_customer", refundable: 2000 }
  const first = await j.call("POST /api/stripe/refund", { as: seller, body: press })
  check("the first press refunds 5.00", first.status === 200 && first.json?.amount === 500 && j.world.refunds.size === 1 && refunded() === 500, { status: first.status, body: first.json, refunds: j.world.refunds.size })
  /* Its answer never reached the page: the dialog still shows 20.00 left, and the seller presses Refund again. */
  const again = await j.call("POST /api/stripe/refund", { as: seller, body: press })
  check("the same press again sends nothing back a second time", j.world.refunds.size === 1 && refunded() === 500, { refunds: j.world.refunds.size, refunded: refunded(), status: again.status, body: again.json })
  check("  refused (409) with what the order holds now, for the page to show", again.status === 409 && again.json?.code === "refund_changed" && again.json?.refundedCents === 500 && again.json?.refundableCents === 1500, { status: again.status, body: again.json })
  check("  in the seller's words", typeof again.json?.error === "string" && /\$5\.00 of this order has already been refunded/.test(again.json.error) && !BANNED.test(again.json.error), again.json?.error)
  check("  and the order still reads 5.00 refunded", j.rows("orders").find((o) => o.id === sold?.id)?.refund_amount_cents === 500)
  const meant = await j.call("POST /api/stripe/refund", { as: seller, body: { ...press, refundable: 1500 } })
  check("a second refund the seller means, on the figure the page now shows, goes through", meant.status === 200 && j.world.refunds.size === 2 && refunded() === 1000 && j.rows("orders").find((o) => o.id === sold?.id)?.refund_amount_cents === 1000, { status: meant.status, body: meant.json })
  const older = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: sold?.id, amount: 5, reason: "requested_by_customer" } })
  check("a page from before this round (no figure) refunds as it did", older.status === 200 && j.world.refunds.size === 3 && refunded() === 1500, { status: older.status, body: older.json })

  console.log("\n2. Get it free sent again (app/api/checkout/process)")
  const ATTEMPT = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
  const guide = newProduct(j, creator.id as string, { title: "Free Guide", priceCents: 0 })
  const claim = { ...instantOrderBody({ productId: guide, email: "cal@example.com", name: "Cal Reader" }, true), attemptId: ATTEMPT }
  const mailsBefore = j.net.to("cal@example.com").length
  const c1 = await j.call("POST /api/checkout/process", { body: claim, headers: { "x-forwarded-for": "198.51.100.11" } })
  const mailsAfterFirst = j.net.to("cal@example.com").length
  /* Its answer never reached the page ("Try again"), and the buyer presses again. */
  const c2 = await j.call("POST /api/checkout/process", { body: claim, headers: { "x-forwarded-for": "198.51.100.11" } })
  const calOrders = j.rows("orders").filter((o) => o.buyer_email === "cal@example.com")
  check("the first press makes the order and sends its receipt", c1.status === 200 && typeof c1.json?.receiptToken === "string" && mailsAfterFirst > mailsBefore, { status: c1.status, body: c1.json })
  check("the same press again: one order, not two", calOrders.length === 1, calOrders.map((o) => o.id))
  check("  answered with that order and its receipt", c2.status === 200 && c2.json?.receiptToken === c1.json?.receiptToken && c2.json?.orderId === c1.json?.orderId, { status: c2.status, body: c2.json })
  check("  and no second receipt email", j.net.to("cal@example.com").length === mailsAfterFirst, j.net.to("cal@example.com").map((m) => m.subject))

  /* A code for one free copy, the press sent again: the code is used once, and the answer is the order, not "used up". */
  const book = newProduct(j, creator.id as string, { title: "Sample Book", priceCents: 1500 })
  const made = await j.call("POST /api/coupons", { as: seller, body: { code: "ONEFREE", discount_type: "percentage", discount_value: 100, usage_limit: 1 } })
  check("a 100% code for one use", made.status === 200 || made.status === 201, { status: made.status, body: made.json })
  const coded = { ...instantOrderBody({ productId: book, couponCode: "ONEFREE", email: "dee@example.com", name: "Dee Reader" }, true), attemptId: "0f1e2d3c-4b5a-4968-8776-655443322110" }
  const k1 = await j.call("POST /api/checkout/process", { body: coded, headers: { "x-forwarded-for": "198.51.100.12" } })
  const k2 = await j.call("POST /api/checkout/process", { body: coded, headers: { "x-forwarded-for": "198.51.100.12" } })
  const oneFree = j.rows("coupons").find((c) => c.code === "ONEFREE")
  check("the first press takes the book free", k1.status === 200 && typeof k1.json?.receiptToken === "string", { status: k1.status, body: k1.json })
  check("the same press again is that order, not \"That code has been used up\"", k2.status === 200 && k2.json?.receiptToken === k1.json?.receiptToken, { status: k2.status, body: k2.json })
  check("  one order, and the code counted once", j.rows("orders").filter((o) => o.buyer_email === "dee@example.com").length === 1 && oneFree?.usage_count === 1, { orders: j.rows("orders").filter((o) => o.buyer_email === "dee@example.com").length, usage: oneFree?.usage_count })
  check("  and no place under the code is left held", j.rows("coupon_holds").length === 0, j.rows("coupon_holds"))
  const other = await j.call("POST /api/checkout/process", { body: { ...instantOrderBody({ productId: book, couponCode: "ONEFREE", email: "eve@example.com", name: "Eve Reader" }, true), attemptId: "11111111-2222-4333-8444-555555555555" }, headers: { "x-forwarded-for": "198.51.100.13" } })
  check("somebody else's press still finds the code used up (the limit holds)", other.status === 400 && /used up/i.test(String(other.json?.error ?? "")), { status: other.status, body: other.json })
  const plain = instantOrderBody({ productId: guide, email: "fay@example.com", name: "Fay Reader" }, true)
  await j.call("POST /api/checkout/process", { body: plain, headers: { "x-forwarded-for": "198.51.100.14" } })
  await j.call("POST /api/checkout/process", { body: plain, headers: { "x-forwarded-for": "198.51.100.14" } })
  check("a page from before this round (no attempt id) claims as it did", j.rows("orders").filter((o) => o.buyer_email === "fay@example.com").length === 2)

  console.log("\n3. A OnePage's free product sent again (app/api/checkout/quick-free)")
  const qf = { product_id: guide, first_name: "Gus", last_name: "Reader", email: "gus@example.com", attempt_id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d" }
  const q1 = await j.call("POST /api/checkout/quick-free", { body: qf, headers: { "x-forwarded-for": "198.51.100.21" } })
  const qMails = j.net.to("gus@example.com").length
  const q2 = await j.call("POST /api/checkout/quick-free", { body: qf, headers: { "x-forwarded-for": "198.51.100.21" } })
  check("the first press makes the order", q1.status === 200 && typeof q1.json?.receipt_token === "string", { status: q1.status, body: q1.json })
  check("the same press again: that order, its receipt and its files", q2.status === 200 && q2.json?.receipt_token === q1.json?.receipt_token && q2.json?.order_id === q1.json?.order_id && Array.isArray(q2.json?.assets), { status: q2.status, body: q2.json })
  check("  one order, one receipt email", j.rows("orders").filter((o) => o.buyer_email === "gus@example.com").length === 1 && j.net.to("gus@example.com").length === qMails)

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

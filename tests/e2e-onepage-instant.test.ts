/**
 * THE ONEPAGE'S INSTANT CHECKOUT, BOUGHT FROM END TO END (round 10)
 *
 * Over the journey harness (tests/_journey: the real route handlers, an
 * in-memory PostgREST, a Stripe world whose webhooks are signed). The window
 * on the page (components/checkout/instant-checkout.tsx) reads the product's
 * facts, then pays exactly as /checkout does: this suite makes the same calls
 * in the same order with the body lib/onepage/product-block instantOrderBody
 * builds, so what is pinned here is what the window does.
 *
 *   facts       a published download answers, with instant on; a draft and an
 *               archived one are 404; a product that ships says no window
 *   paid        stripe-session, Stripe confirms, confirm-payment: the order,
 *               the receipt, the buyer's email, the entitlement, a code taken
 *   free        process: the order and the receipt, nothing charged
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
const section = (t: string) => console.log(`\n${t}\n`)

async function main() {
  const j = await Journey.start()

  section("1. A store with payments on, a download, a draft, an archived one, a mug, a free guide")
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const pack = newProduct(j, creator.id as string, { type: "digital", title: "Tech House Pack", priceCents: 2000 })
  const draft = newProduct(j, creator.id as string, { type: "digital", title: "Next Pack", priceCents: 1500, status: "draft" })
  const archived = newProduct(j, creator.id as string, { type: "digital", title: "Old Pack", priceCents: 900, status: "archived" })
  const mug = newProduct(j, creator.id as string, { type: "physical", title: "Mug", priceCents: 1800 })
  const guide = newProduct(j, creator.id as string, { type: "digital", title: "Free Guide", priceCents: 0 })
  await j.call("POST /api/coupons", { as: seller, body: { code: "HALF", discount_type: "percentage", discount_value: 50 } })

  section("2. The facts the sheet and the window read")
  const facts = await j.call(`GET /api/onepage/product?id=${pack}`)
  check("a published download answers, with the window on", facts.status === 200 && facts.json?.product?.title === "Tech House Pack" && facts.json?.checkout?.instant === true && facts.json?.product?.priceCents === 2000, { status: facts.status, body: facts.json })
  check("  its description cleaned for the page (no script)", typeof facts.json?.product?.descriptionHtml === "string" && facts.json.product.descriptionHtml.includes("Tech House Pack") && !/<script/i.test(facts.json.product.descriptionHtml), facts.json?.product?.descriptionHtml)
  check("  the store's name for the window's head", facts.json?.seller?.name === "Mara Sounds", facts.json?.seller)
  const d = await j.call(`GET /api/onepage/product?id=${draft}`)
  const a = await j.call(`GET /api/onepage/product?id=${archived}`)
  check("a draft is not shown or sold (404)", d.status === 404, { status: d.status, body: d.json })
  check("an archived product is not shown or sold (404)", a.status === 404, { status: a.status, body: a.json })
  const m = await j.call(`GET /api/onepage/product?id=${mug}`)
  check("a product that ships: no window, its checkout instead", m.status === 200 && m.json?.checkout?.instant === false && m.json?.product?.ships === true, m.json?.checkout)

  section("3. Paid in the window, with a code")
  const code = await j.call("POST /api/coupons/validate", { body: { code: "half", productId: pack, variantId: null, customPriceCents: null, pricing: null } })
  check("the code is checked as the checkout page checks it: 10.00 off", code.json?.ok === true && code.json?.discountCents === 1000, code.json)
  const before = j.world.intents.size
  const started = await j.call("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: pack, couponCode: "HALF", email: "bea@example.com", name: "Bea Buyer" }, false) })
  check("the checkout's own PaymentIntent, for 10.00", started.status === 200 && typeof started.json?.clientSecret === "string" && j.world.intents.size === before + 1, { status: started.status, body: started.json })
  const pi = started.json?.paymentIntentId ? j.world.intents.get(started.json.paymentIntentId) : null
  check("  charged on the store's account, the code's price", pi?.amount === 1000 && pi?.transfer_data?.destination === acct, pi && { amount: pi.amount, dest: pi.transfer_data })
  if (pi) j.world.payIntent(pi.id)
  const confirmed = await j.call("POST /api/checkout/confirm-payment", { body: { paymentIntentId: started.json?.paymentIntentId, clientSecret: started.json?.clientSecret } })
  check("confirm-payment makes the order and answers its receipt", confirmed.status === 200 && typeof confirmed.json?.receiptToken === "string", { status: confirmed.status, body: confirmed.json })
  await j.cron()
  const order = j.rows("orders").find((o) => o.buyer_email === "bea@example.com")
  check("one order, 10.00, with the code", !!order && order.amount_cents === 1000 && j.rows("orders").filter((o) => o.buyer_email === "bea@example.com").length === 1, order && { amount: order.amount_cents, code: order.coupon_code })
  check("the buyer's receipt email", j.net.to("bea@example.com").some((mail) => /receipt|order|purchase/i.test(mail.subject)), j.net.to("bea@example.com").map((mail) => mail.subject))
  check("the code counted once", j.rows("coupons").find((c) => c.code === "HALF")?.usage_count === 1, j.rows("coupons").find((c) => c.code === "HALF"))

  section("4. A free one, taken in the window")
  const freeFacts = await j.call(`GET /api/onepage/product?id=${guide}`)
  check("a free download: the window takes it", freeFacts.json?.checkout?.instant === true && freeFacts.json?.product?.priceCents === 0, freeFacts.json?.checkout)
  const intents = j.world.intents.size
  const free = await j.call("POST /api/checkout/process", { body: instantOrderBody({ productId: guide, email: "cal@example.com", name: "Cal" }, true) })
  check("the free checkout makes the order and its receipt", free.status === 200 && typeof free.json?.receiptToken === "string", { status: free.status, body: free.json })
  check("  and Stripe is never asked", j.world.intents.size === intents)
  check("  an order for 0.00", j.rows("orders").some((o) => o.buyer_email === "cal@example.com" && (o.amount_cents ?? 0) === 0))

  section("5. A draft can never be bought through the window's routes")
  const sneaky = await j.call("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: draft, email: "eve@example.com", name: "Eve" }, false) })
  check("stripe-session refuses a draft", sneaky.status >= 400 && sneaky.status < 500, { status: sneaky.status, body: sneaky.json })

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number; status?: string }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const status = p.status ?? "published"
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}</p><script>alert(1)</script>`, status, archived: status === "archived", price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * ROUND 57 (e3): WHAT STORELIB TAKES FROM EACH SALE, ON EACH PLAN, PROVEN
 *
 * The published pricing (lib/help/articles.ts "What Storelib charges per sale"
 * and "Currencies, prices and payouts", lib/help/physical-articles.ts "Plans
 * and fees for physical sales") written out HERE as literals, independently
 * of the fee engine, and every checkout's real fee path held to it:
 *
 *   plan       digital          ships            under the threshold (no fixed part)
 *   Free       5% + $0.25       3% + $0.25       11.25% digital, 9.25% ships
 *   Grow       3% + $0.25       1.5% + $0.25     9.25% digital, 7.75% ships
 *   Pro        1.5% + $0.25     1.5% + $0.25     7.75% both
 *
 *   "A paid plan's rate applies while its subscription is active or trialing;
 *    otherwise the Free rate applies."  (so past_due, canceled, unpaid pay Free)
 *   "An order with both pays each product's own rate, with one $0.25."
 *   "Delivery and tax on an order that ships pay the rate for products that ship."
 *   A digital checkout's fee "stays on the price, never on the tax".
 *   "Storelib's fee on the sale is not returned" on a refund.
 *
 * Part A: the matrix, through calculatePlatformFeeForCheckout (what every
 *   checkout calls) with the creator's row from a stubbed database.
 * Part B: the real routes over the journey harness (tests/_journey: in-memory
 *   PostgREST, a Stripe world): the PaymentIntent each checkout asks Stripe for
 *   carries exactly the expected application_fee_amount, a plan change applies
 *   to the next checkout, a lapsed plan falls back to Free, a refund keeps the fee.
 * Part C: a membership renewal (invoice.created through the real webhook) sets
 *   the exact fee on the price, not on the tax Stripe added (the r57 fix in
 *   lib/memberships/webhook.ts exactRenewalFee).
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { calculatePlatformFeeForCheckout } from "@/lib/billing/platform-fee-server"
import { clearActiveFeeConfigCache } from "@/lib/payments/fees/active"
import { renewalFeeBaseCents } from "@/lib/memberships/webhook-fee"
import { stripe } from "@/lib/stripe"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

/* ── The published pricing, as literals ─────────────────────────────────── */

type Tier = "free" | "grow" | "pro"
type Kind = "digital" | "physical"
const PUBLISHED: Record<Tier, Record<Kind, { std: number; micro: number }>> = {
  free: { digital: { std: 0.05, micro: 0.1125 }, physical: { std: 0.03, micro: 0.0925 } },
  grow: { digital: { std: 0.03, micro: 0.0925 }, physical: { std: 0.015, micro: 0.0775 } },
  pro: { digital: { std: 0.015, micro: 0.0775 }, physical: { std: 0.015, micro: 0.0775 } },
}
/* "The same rule applies in every currency, at the equivalent amount (for example 3.68 EUR)." */
const CURRENCY: Record<string, { threshold: number; fixed: number }> = {
  USD: { threshold: 400, fixed: 25 },
  EUR: { threshold: 368, fixed: 23 },
  GBP: { threshold: 316, fixed: 20 },
  JPY: { threshold: 600, fixed: 40 },
}
function published(tier: Tier, gross: number, physical: number, currency = "USD"): number {
  const c = CURRENCY[currency]
  const micro = gross < c.threshold
  const r = (k: Kind) => (micro ? PUBLISHED[tier][k].micro : PUBLISHED[tier][k].std)
  const pct = Math.round((gross - physical) * r("digital") + physical * r("physical"))
  return Math.min(gross, pct + (micro ? 0 : c.fixed))
}

/* "active or trialing" keeps the paid plan; anything else is Free. */
const STATES: { plan: string | null; status: string | null; tier: Tier; label: string }[] = [
  { plan: "free", status: "active", tier: "free", label: "Free" },
  { plan: null, status: null, tier: "free", label: "no plan row" },
  { plan: "growth", status: "active", tier: "grow", label: "Grow active" },
  { plan: "growth", status: "trialing", tier: "grow", label: "Grow trialing" },
  { plan: "growth", status: "past_due", tier: "free", label: "Grow past due" },
  { plan: "growth", status: "canceled", tier: "free", label: "Grow canceled" },
  { plan: "growth", status: "unpaid", tier: "free", label: "Grow unpaid" },
  { plan: "growth", status: "incomplete", tier: "free", label: "Grow incomplete" },
  { plan: "pro", status: "active", tier: "pro", label: "Pro active" },
  { plan: "pro", status: "trialing", tier: "pro", label: "Pro trialing" },
  { plan: "professional", status: "active", tier: "pro", label: "legacy professional" },
  { plan: "pro", status: "canceled", tier: "free", label: "Pro canceled" },
  { plan: "scale", status: "active", tier: "free", label: "unknown id" },
]

function stubDb(row: { subscription_plan_id: string | null; subscription_status: string | null } | null) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => (row ? { data: row, error: null } : { data: null, error: { message: "no row" } }),
    maybeSingle: async () => ({ data: null, error: null }),
  }
  return { from: () => chain } as any
}

async function partA() {
  section("A. Every plan state x kind x amount x currency, through calculatePlatformFeeForCheckout")
  clearActiveFeeConfigCache()
  const amounts = [50, 100, 399, 400, 401, 1000, 4999, 100000]
  const table: string[] = []
  let mismatches: unknown[] = []
  for (const s of STATES) {
    const db = stubDb(s.plan === null ? null : { subscription_plan_id: s.plan, subscription_status: s.status })
    for (const currency of ["USD", "EUR", "GBP", "JPY"]) {
      for (const gross of amounts) {
        for (const split of ["digital", "physical", "mixed"] as const) {
          const physical = split === "digital" ? 0 : split === "physical" ? gross : Math.floor(gross * 0.6)
          const fee = await calculatePlatformFeeForCheckout(gross, "creator-1", db, currency.toLowerCase(), split === "mixed" ? { physicalCents: physical } : split)
          const want = published(s.tier, gross, physical, currency)
          if (fee.platformFeeCents !== want || fee.sellerReceivesCents !== gross - want) mismatches.push({ state: s.label, currency, gross, split, got: fee.platformFeeCents, want })
          if (currency === "USD" && (gross === 399 || gross === 1000)) table.push(`${s.label.padEnd(20)} ${split.padEnd(8)} ${String(gross).padStart(5)}c  expected ${String(want).padStart(3)}c  actual ${String(fee.platformFeeCents).padStart(3)}c`)
        }
      }
    }
  }
  console.log(table.map((l) => `        ${l}`).join("\n"))
  check(`${STATES.length * 4 * amounts.length * 3} fees, each equal to the published pricing (seller gets the rest)`, mismatches.length === 0, mismatches.slice(0, 8))

  /* The small order rule: a fee never falls as the price rises past the threshold. */
  const db = stubDb({ subscription_plan_id: "growth", subscription_status: "active" })
  const at = async (gross: number, kind: Kind) => (await calculatePlatformFeeForCheckout(gross, "c", db, "usd", kind)).platformFeeCents
  check("Grow: $3.99 and $4.00 pay the same, digital (37c) and ships (31c)", (await at(399, "digital")) === 37 && (await at(400, "digital")) === 37 && (await at(399, "physical")) === 31 && (await at(400, "physical")) === 31)
  let threw = false
  try {
    await calculatePlatformFeeForCheckout(1000, "c", db, "xyz", "digital")
  } catch {
    threw = true
  }
  check("a currency with no published rule is refused, never charged a guessed fee", threw)
}

/* ── B. The real routes ─────────────────────────────────────────────────── */

async function partB() {
  const j = await Journey.start()
  section("B. A US store on each plan, through the real checkout routes")
  const seller = await j.signUp("fees@example.com", { name: "Fay Fees" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "fay-fees" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Fay Fees", supportEmail: "hello@fay.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const setPlan = (plan: string, status: string) => Object.assign(j.rows("creators").find((c) => c.id === creator.id)!, { subscription_plan_id: plan, subscription_status: status })

  const ten = newProduct(j, creator.id, { type: "digital", title: "Ten Dollar Pack", priceCents: 1000 })
  const small = newProduct(j, creator.id, { type: "digital", title: "Small Pack", priceCents: 399 })
  let n = 0
  /* Each buyer from their own address: the payment limit (10 in 10 minutes per address and per email) is held below. */
  const buy = async (productId: string, extra: Record<string, unknown> = {}, ip?: string) => {
    ++n
    const r = await j.call("POST /api/checkout/stripe-session", { headers: { "x-forwarded-for": ip ?? `198.51.100.${n}` }, body: { productId, email: `buyer${n}@example.com`, firstName: "Bea", lastName: "Buyer", agreedToTerms: true, paymentMethods: ["card"], ...extra } })
    const id = (r.json?.paymentIntentId ?? r.json?.intentId ?? (typeof r.json?.clientSecret === "string" ? r.json.clientSecret.split("_secret")[0] : undefined)) as string | undefined
    return { r, pi: id ? (j.world.intents.get(id) as any) ?? null : null }
  }

  const rows: string[] = []
  for (const s of STATES.filter((x) => x.plan !== null)) {
    setPlan(s.plan!, s.status!)
    for (const [pid, gross] of [[ten, 1000], [small, 399]] as const) {
      const { r, pi } = await buy(pid)
      const want = published(s.tier, gross, 0)
      rows.push(`${s.label.padEnd(20)} ${String(gross).padStart(5)}c  expected ${want}c  actual ${pi?.application_fee_amount ?? r.status}`)
      check(`${s.label}, a ${gross}c download: PaymentIntent fee ${want}c to the seller's account`, r.status === 200 && pi?.application_fee_amount === want && pi?.amount === gross && pi?.transfer_data?.destination === acct, { status: r.status, body: r.json, fee: pi?.application_fee_amount, amount: pi?.amount })
    }
  }
  console.log(rows.map((l) => `        ${l}`).join("\n"))

  section("B2. Tips, codes and a plan change")
  setPlan("free", "active")
  const tipped = await buy(ten, { tipCents: 250 })
  check("Free, $10 + $2.50 tip: the fee is on the whole charge, 5% of 1250 + 25 = 88c", tipped.pi?.amount === 1250 && tipped.pi?.application_fee_amount === published("free", 1250, 0), { amount: tipped.pi?.amount, fee: tipped.pi?.application_fee_amount, want: published("free", 1250, 0) })
  const made = await j.call("POST /api/coupons", { as: seller, body: { code: "HALF", discount_type: "percentage", discount_value: 50 } })
  const coded = await buy(ten, { couponCode: "HALF" })
  check("Free, $10 with 50% off: charged $5, the fee on $5 (50c), not on the list price", made.status < 300 && coded.pi?.amount === 500 && coded.pi?.application_fee_amount === published("free", 500, 0), { made: made.status, amount: coded.pi?.amount, fee: coded.pi?.application_fee_amount })
  setPlan("pro", "active")
  const upgraded = await buy(ten)
  check("upgraded to Pro: the very next checkout pays Pro's 40c", upgraded.pi?.application_fee_amount === published("pro", 1000, 0), upgraded.pi?.application_fee_amount)
  setPlan("pro", "canceled")
  const lapsed = await buy(ten)
  check("Pro cancelled: the next checkout falls back to Free's 75c", lapsed.pi?.application_fee_amount === published("free", 1000, 0), lapsed.pi?.application_fee_amount)

  section("B2b. The checkout's payment limit")
  const burst: number[] = []
  for (let i = 0; i < 11; i++) burst.push((await buy(ten, {}, "192.0.2.77")).r.status)
  check("one address starting an 11th payment in 10 minutes is refused (429), the first 10 are not", burst.slice(0, 10).every((s) => s === 200) && burst[10] === 429, burst)

  section("B3. A refund keeps Storelib's fee and takes the seller's share back")
  setPlan("growth", "active")
  const sold = await buy(ten)
  const paid = j.world.payIntent(sold.pi.id)
  if (paid.charge) await j.webhook("charge.succeeded", paid.charge)
  await j.webhook("payment_intent.succeeded", paid.intent)
  await j.cron()
  const order = j.rows("orders").find((o) => o.stripe_payment_intent_id === sold.pi.id)
  check("the order records the fee Stripe was told (Grow, 55c)", order?.amount_cents === 1000 && Number(order?.platform_fee_cents ?? order?.application_fee_cents ?? order?.fee_cents) === 55, order && { amount: order.amount_cents, fee: [order.platform_fee_cents, order.application_fee_cents, order.fee_cents] })
  const refund = await j.call("POST /api/stripe/refund", { as: seller, body: { orderId: order?.id, amount: 4, reason: "requested_by_customer" } })
  const call = j.world.calls.filter((c) => c.method === "refunds.create").pop()?.args[0] as any
  check("a $4 refund: 400c, reverse_transfer on, the application fee not refunded (as the help says)", refund.status === 200 && call?.amount === 400 && call?.reverse_transfer === true && !call?.refund_application_fee, { status: refund.status, call })

  section("B4. A basket on the website (digital) and a cart that ships")
  setPlan("growth", "active")
  await j.call("PUT /api/store/currency", { as: seller, body: { country: "US", currency: "USD", key: "fay-usd-1" } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const loc = j.rows("inventory_locations").find((l) => l.creator_id === creator.id)?.id as string
  if (loc) await j.call(`PATCH /api/physical/locations/${loc}`, { as: seller, body: { name: "Studio", kind: "home", addressLine1: "1 Main St", city: "Austin", postalCode: "78701", country: "US", region: "TX" } })
  const profileId = j.rows("shipping_profiles").find((p) => p.creator_id === creator.id)?.id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["US"], name: "United States" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("US"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Standard", priceCents: 500, minDays: 2, maxDays: 5 } })
  const mug = newProduct(j, creator.id, { type: "physical", title: "Clay Mug", priceCents: 4000 })
  await j.call(`PUT /api/physical/products/${mug}`, { as: seller, body: { variants: [{ options: [], priceCents: 4000, sku: "MUG", weightGrams: 400, stock: { [loc]: 10 } }], requiresShipping: true, weightGrams: 400, taxable: false, trackInventory: true, fulfillmentLocationId: loc } })
  const address = { name: "Sam Ship", line1: "2 Elm St", city: "Austin", postalCode: "78702", country: "US", region: "TX", phone: "+1 512 555 0100" }
  const shipQuote = async (items: any[]) => (await j.call("POST /api/physical/checkout/quote", { body: { items, shopId: creator.id, country: "US", postalCode: "78702", region: "TX" } })).json
  const startShip = async (items: any[], key: string) => {
    const q = await shipQuote(items)
    const option = (q?.delivery?.options ?? []).find((o: any) => o.name === "Standard")?.id
    const r = await j.call("POST /api/physical/checkout", { body: { shopId: creator.id, items, email: `${key}@example.com`, name: address.name, address, deliveryOptionId: option, clientKey: key } })
    const co = j.rows("commerce_checkouts").find((c) => c.client_key === key)
    const session = co?.stripe_session_id ? (j.world.sessions.get(co.stripe_session_id) as any) : null
    return { r, co, pd: session?.__params?.payment_intent_data ?? null }
  }
  const one = await startShip([{ productId: mug, variantId: null, quantity: 1 }], "ship-one")
  /* $40 mug + $5 delivery = 4500 physical: 1.5% = 67.5, rounded 68, + 25. */
  const wantShip = published("grow", 4500, 4500)
  check(`Grow, a $40 mug + $5 delivery: the fee is on 4500 at the ships rate, ${wantShip}c`, one.co?.total_cents === 4500 && one.pd?.application_fee_amount === wantShip, { status: one.r.status, body: one.r.status === 200 ? undefined : one.r.json, total: one.co?.total_cents, fee: one.pd?.application_fee_amount })
  const both = await startShip([{ productId: mug, variantId: null, quantity: 1 }, { productId: ten, variantId: null, quantity: 1 }], "ship-mixed")
  /* 5500 charged, 1000 of it the download: 1000 x 3% + 4500 x 1.5%, one 25c. */
  const wantMixed = published("grow", 5500, 4500)
  check(`Grow, the mug and a $10 download in one cart: each part at its own rate, one 25c, ${wantMixed}c`, both.co?.total_cents === 5500 && both.pd?.application_fee_amount === wantMixed, { status: both.r.status, body: both.r.status === 200 ? undefined : both.r.json, total: both.co?.total_cents, fee: both.pd?.application_fee_amount })

  section("C. A membership renewal's exact fee is on the price, not on the tax")
  setPlan("growth", "active")
  const updates: { id: string; params: any }[] = []
  ;(stripe as any).invoices.update = async (id: string, params: any) => {
    updates.push({ id, params })
    return { id, ...params }
  }
  const invoice = (id: string, amountDue: number, taxes: { amount: number; tax_behavior: "exclusive" | "inclusive" }[]) => ({
    id,
    object: "invoice",
    status: "draft",
    billing_reason: "subscription_cycle",
    currency: "usd",
    amount_due: amountDue,
    amount_paid: 0,
    subtotal: amountDue - taxes.filter((t) => t.tax_behavior === "exclusive").reduce((a, t) => a + t.amount, 0),
    total_taxes: taxes.map((t) => ({ ...t, taxability_reason: "standard_rated", tax_rate_details: { tax_rate: "txr_1" }, type: "tax_rate_details" })),
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_test_r57", metadata: { kind: "membership", creator_id: creator.id } } },
    lines: { data: [] },
  })
  /* $20 a month with 20% tax added on top: Stripe bills 2400; the fee is Grow's on the 2000 price: 3% + 25 = 85c. */
  await j.webhook("invoice.created", invoice("in_tax_excl", 2400, [{ amount: 400, tax_behavior: "exclusive" }]))
  const excl = updates.find((u) => u.id === "in_tax_excl")
  check("renewal of $20 + $4 tax added: fee 85c on the $20 price (it was 97c, on $24 with the tax)", excl?.params?.application_fee_amount === published("grow", 2000, 0), { got: excl?.params, want: published("grow", 2000, 0) })
  await j.webhook("invoice.created", invoice("in_tax_incl", 2000, [{ amount: 333, tax_behavior: "inclusive" }]))
  const incl = updates.find((u) => u.id === "in_tax_incl")
  check("renewal of $20 with the tax inside the price: fee on the $20 price, 85c, as a one time sale", incl?.params?.application_fee_amount === published("grow", 2000, 0), incl?.params)
  await j.webhook("invoice.created", invoice("in_no_tax", 2000, []))
  check("renewal with no tax: 85c", updates.find((u) => u.id === "in_no_tax")?.params?.application_fee_amount === published("grow", 2000, 0))
  check("renewalFeeBaseCents: 2400 less 400 added tax is 2000; an inclusive tax stays in; never below 0", renewalFeeBaseCents({ amount_due: 2400, total_taxes: [{ amount: 400, tax_behavior: "exclusive" }] }) === 2000 && renewalFeeBaseCents({ amount_due: 2000, total_taxes: [{ amount: 333, tax_behavior: "inclusive" }] }) === 2000 && renewalFeeBaseCents({ amount_due: 100, total_tax_amounts: [{ amount: 500, inclusive: false }] }) === 0 && renewalFeeBaseCents({ amount_due: 1200, total_tax_amounts: [{ amount: 200, inclusive: false }] }) === 1000)

  const unexpected = j.serverErrors
  check("no route answered with a server error", unexpected.length === 0, unexpected)
}

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

async function main() {
  await partA()
  await partB()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

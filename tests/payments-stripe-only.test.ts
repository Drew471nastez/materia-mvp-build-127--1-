/**
 * ===========================================================================
 *  STRIPE IS THE ONLY PAYMENTS PROVIDER (round AE)
 * ===========================================================================
 * The owner: "Airwallex is not on Storelib anymore, it is Stripe". Its
 * adapter, checkout path, return route, hub actions, refunds, readiness and
 * reminders are gone. What stays:
 *
 *   orders paid through Airwallex before, read only: counted like any sale,
 *   named "Airwallex" where the payment method is shown, and never offered a
 *   Refund that would call Airwallex (the order page says where to refund)
 *
 *   its old notification URL, answering 410 Gone so a sender stops
 *
 *   a one time note in Settings > Payments for a creator who had an
 *   Airwallex account and has not connected Stripe yet
 *
 * The money helpers the old Airwallex suite covered (lib/payments/money)
 * stay in use for every currency, so their checks moved here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { decimalsOf, toMajor, toMajorNumber, toMinor } from "@/lib/payments/money"
import { payoutStatusOf, STAGE_COPY } from "@/lib/payments/model"
import { PAST_PROVIDER_LABEL, PAST_PROVIDER_REFUND_NOTE, paidThroughAirwallex } from "@/lib/payments/past-provider"
import { canRefundLine, groupOrders, refundableCents, type OrderRow } from "@/lib/orders/order-view"
import { paymentMethodOf } from "@/lib/orders/timeline"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

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

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

console.log("\n1. The integration is gone")
{
  const removed = [
    "lib/payments/airwallex",
    "lib/payments/refunds.ts",
    "lib/payments/store.ts",
    "lib/payments/readiness.ts",
    "lib/payments/active-provider.ts",
    "app/(storelib)/checkout/parts/airwallex-redirect.ts",
    "app/api/payments/airwallex/return",
  ]
  for (const p of removed) check(`${p} is removed`, !existsSync(join(root, p)))

  /* Every file that still names Airwallex, and why it may. Anything else naming it is a leftover. */
  const allowed = new Set([
    "lib/payments/past-provider.ts", // the past provider's label and refund note
    "lib/payments/model.ts", // says Stripe is the only provider
    "lib/payments/service.ts", // reads whether a creator had an Airwallex account, for the note
    "lib/payments/hub-types.ts", // airwallexBefore on the overview
    "app/api/payments/airwallex/webhook/route.ts", // 410 Gone
    "app/api/stripe/refund/route.ts", // refuses an Airwallex order with the note
    "app/(storelib)/app/orders/order-detail.tsx", // the note where Refund would be
    "lib/orders/order-view.ts", // canRefundLine says no
    "lib/orders/timeline.ts", // the payment method names it
    "lib/orders/load-rows.ts", // reads provider for that
    "lib/physical/buyer-cancel-server.ts", // a buyer cancel asks the shop instead
    "lib/checkout/invoice.ts", // the row's provider_payment_id, read never called
    "lib/auth/no-session-paths.ts", // the 410 route needs no session
    "components/app/settings/storelib-payments-settings.tsx", // the one time note
  ])
  const strays: string[] = []
  for (const dir of ["app", "components", "lib"]) {
    for (const file of walk(join(root, dir))) {
      const rel = file.slice(root.length + 1)
      if (!/\.(ts|tsx|mjs|js)$/.test(rel) || rel.startsWith("lib/i18n/catalog/")) continue
      if (/airwallex/i.test(readFileSync(file, "utf8")) && !allowed.has(rel)) strays.push(rel)
    }
  }
  check("nothing else in app, components or lib names Airwallex", strays.length === 0, strays)

  const csp = read("lib/security/csp.ts")
  check("the page no longer allows Airwallex's scripts or frames", !/airwallex/i.test(csp) && !/airwallex/i.test(read("vercel.json")))
  check("no Airwallex environment variable is read", !/AIRWALLEX_|STORELIB_PAYMENTS_AIRWALLEX/.test(walk(join(root, "lib")).concat(walk(join(root, "app"))).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n")))

  const client = read("app/(storelib)/checkout/checkout-client.tsx")
  check("checkout has no Airwallex branch or prop", !/airwallex/i.test(client) && !/paymentProvider/.test(client) && !/paymentProvider/.test(read("app/(storelib)/checkout/page.tsx")))
  check("Settings has no provider switch", !/paymentsProvider/.test(read("components/app/settings-form-new.tsx")) && !/providerFor/.test(read("app/(storelib)/app/settings/_server.ts")))

  const api = read("app/api/payments/[action]/route.ts")
  check("the hub API has no Airwallex-only actions", !/case "(verify|form-status|payout-account|payout)":/.test(api) && !/airwallex/i.test(api))
  check("an embedded session is Stripe's only", /body\.purpose === "stripe_payouts" \|\| body\.purpose === "stripe_onboarding" \|\| body\.purpose === "stripe_management"/.test(api))

  const service = read("lib/payments/service.ts")
  check("checkout's gate is Stripe's row", /return stripeRowReady\(await readCreatorStripe\(creatorId\)\)/.test(service))
  check("refunds and sold out refunds never call Airwallex", !/airwallex/i.test(read("lib/checkout/sold-out-refund.ts")) && !/refundAirwallexOrder/.test(read("app/api/stripe/refund/route.ts")))
  check("an order is always written with Stripe's PaymentIntent", /stripe_payment_intent_id: paid\.paymentId,/.test(read("lib/checkout/fulfil-payment.ts")) && !/fulfilAirwallexIntent|paidAirwallexCheckout/.test(read("lib/checkout/fulfil-payment.ts")))
  check("the reminders count Stripe only", !/payment_accounts/.test(read("lib/notify/payout-weekly.ts")) && !/payment_accounts/.test(read("lib/notify/store.ts")) && !/payment_accounts/.test(read("lib/notifications/snapshot.ts")))
  check("no hub copy mentions Airwallex", !Object.values(STAGE_COPY).some((c) => /airwallex/i.test(`${c.title} ${c.line ?? ""}`)))
}

console.log("\n2. Its old webhook answers 410 Gone")
{
  const route = read("app/api/payments/airwallex/webhook/route.ts")
  check("410, with a log line", /status: 410/.test(route) && /console\.warn\(/.test(route))
  check("  reading no body and no database", !/request\.(text|json|formData)\(/.test(route) && !/createAdminClient|supabase/.test(route))
}

console.log("\n3. Orders paid through Airwallex stay readable, without Refund")
{
  const line = (extra: Partial<OrderRow>): OrderRow =>
    ({ id: "o1", product_id: "p1", amount_cents: 2500, status: "completed", created_at: "2026-05-02T10:00:00Z", currency: "usd", card_brand: "visa", card_last4: "4242", payment_method: "card", ...extra }) as OrderRow
  const awx = line({ provider: "airwallex", provider_payment_id: "int_abc", stripe_payment_intent_id: null })
  const stripeLine = line({ provider: "stripe", stripe_payment_intent_id: "pi_1" })
  check("it is recognised as Airwallex's", paidThroughAirwallex(awx) && paidThroughAirwallex({ provider: "AIRWALLEX" }) && !paidThroughAirwallex(stripeLine) && !paidThroughAirwallex(null))
  check("its money still counts as refundable money (Analytics and Orders read it)", refundableCents(awx) === 2500)
  check("but the Orders page offers no Refund for it", !canRefundLine(awx))
  check("  while a Stripe sale still has one", canRefundLine(stripeLine))
  check("  and a part refunded Airwallex sale has none either", !canRefundLine({ ...awx, status: "refunded", refund_amount_cents: 500 }))
  const [order] = groupOrders([awx])
  check("the order groups and totals like any other", order.totalCents === 2500 && order.payment === "paid", { total: order.totalCents, payment: order.payment })
  check("the payment method names Airwallex", paymentMethodOf(order) === `Visa •••• 4242, ${PAST_PROVIDER_LABEL}`, paymentMethodOf(order))
  const [bare] = groupOrders([line({ provider: "airwallex", card_brand: null, card_last4: null, stripe_payment_intent_id: null })])
  check("  and is just Airwallex when nothing else was kept", paymentMethodOf(bare) === "Airwallex", paymentMethodOf(bare))
  const [stripeOrder] = groupOrders([stripeLine])
  check("a Stripe order reads as it did", paymentMethodOf(stripeOrder) === "Visa •••• 4242")

  const refund = read("app/api/stripe/refund/route.ts")
  const refuse = refund.indexOf("if (paidThroughAirwallex(order))")
  check("the refund route refuses it with where to refund, before any Stripe call", refuse > 0 && refuse < refund.indexOf("stripe.refunds.create(") && /error: PAST_PROVIDER_REFUND_NOTE \}, \{ status: 409 \}/.test(refund))
  check("  in plain words", PAST_PROVIDER_REFUND_NOTE === "Refund this order in your Airwallex account.")
  const detail = read("app/(storelib)/app/orders/order-detail.tsx")
  check("the order page says it where Refund would be", /paidThroughAirwallex\(l\) && refundableCents\(l\) > 0/.test(detail) && /tt\("Refund this order in your Airwallex account\."\)/.test(detail))
}

console.log("\n4. A creator who had Airwallex is told once to connect Stripe")
{
  const service = read("lib/payments/service.ts")
  check("the overview flags it only while Stripe cannot take money", /if \(!view\.checkoutOpen && \(await hadAirwallexAccount\(creator\.id\)\)\) return \{ \.\.\.view, airwallexBefore: true \}/.test(service))
  check("  from part 76's rows, read only, and a missing table is no", /\.from\("payment_accounts"\)\s*\.select\("provider_account_id"\)\s*\.eq\("provider", "airwallex"\)/.test(service) && /if \(error\) return false/.test(service) && !/payment_accounts"\)[\s\S]{0,80}\.(update|delete|insert|upsert)\(/.test(service))
  const hub = read("components/app/settings/storelib-payments-settings.tsx")
  check("Settings shows the note", /data\.airwallexBefore && !airwallexNoteClosed/.test(hub) && /tt\("Connect Stripe to keep selling"\)/.test(hub))
  check("  and closing it is remembered, safely", /localStorage\.setItem\(AIRWALLEX_NOTE_KEY, "1"\)/.test(hub) && /try \{\s*if \(window\.localStorage\.getItem\(AIRWALLEX_NOTE_KEY\)\)/.test(hub))
  const de = read("lib/i18n/catalog/de.ts")
  check("  in every language", /"Connect Stripe to keep selling":/.test(de) && /"Refund this order in your Airwallex account\.":/.test(de))
}

console.log("\n5. Money in the smallest unit, for every currency")
{
  check("dollars have two decimals, yen none, dinars three", decimalsOf("usd") === 2 && decimalsOf("JPY") === 0 && decimalsOf("KWD") === 3)
  check("1234 cents is 12.34", toMajor(1234, "USD") === "12.34")
  check("5 cents is 0.05, not 0.5", toMajor(5, "USD") === "0.05")
  check("1234 yen is 1234", toMajor(1234, "JPY") === "1234")
  check("1234 fils is 1.234 dinars", toMajor(1234, "KWD") === "1.234")
  check("a negative amount keeps its sign", toMajor(-250, "EUR") === "-2.50")
  check("a JSON number", toMajorNumber(1999, "USD") === 19.99)
  let threw = false
  try {
    toMajor(12.5, "USD")
  } catch {
    threw = true
  }
  check("a fraction of a cent is refused", threw)
  check("0.29 back is 29, never 28.999", toMinor(0.29, "USD") === 29 && toMinor("0.29", "USD") === 29)
  check("a figure finer than the currency rounds half up", toMinor("1.005", "USD") === 101 && toMinor("1.004", "USD") === 100)
  check("yen and dinars come back whole", toMinor(1200, "JPY") === 1200 && toMinor("1.234", "KWD") === 1234)
  check("nothing is zero", toMinor(null, "USD") === 0 && toMinor(undefined, "USD") === 0)
  let roundTrip = true
  for (let n = -3000; n <= 3000; n += 7) if (toMinor(toMajor(n, "USD"), "USD") !== n) roundTrip = false
  check("every amount survives the round trip", roundTrip)
}

console.log("\n6. Stripe's payout statuses in the hub's words")
{
  check("paid, failed and in transit", payoutStatusOf("paid").text === "Paid" && payoutStatusOf("failed").status === "failed" && payoutStatusOf("in_transit").text === "On its way")
  check("Stripe's one-l canceled is Cancelled", payoutStatusOf("canceled").status === "cancelled")
  check("anything else waits", payoutStatusOf("pending").status === "waiting" && payoutStatusOf(null).status === "waiting")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("Failed:\n" + failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}

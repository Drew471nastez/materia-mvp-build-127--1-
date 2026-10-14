/**
 * Cash on delivery (lib/physical/cash-on-delivery.ts): the rules a cart is
 * held to, the order's payment state, the seller's switch, how the Orders
 * list and the buyer's email read it, and that every surface that takes the
 * order (checkout routes, the card form, the order panel, refunds, the SQL
 * part) is wired to the same rules.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COD_PAYMENT_METHOD, COD_PROVIDER, cashDue, codClientKey, codRefusal, paymentStateOf } from "@/lib/physical/cash-on-delivery"
import { DEFAULT_CHECKOUT, checkoutConfig, mergeCheckout } from "@/lib/store/checkout-config"
import { groupOrders, inView, isSale, type OrderRow } from "@/lib/orders/order-view"
import { orderConfirmationEmail, type OrderEmailModel } from "@/lib/physical/email-templates"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nWhich carts can be paid on delivery")
  const physical = [{ type: "physical" }, { type: "physical" }]
  check("a shop that has it off says so", /doesn't take cash/.test(codRefusal({ enabled: false, lines: physical, requiresShipping: true, totalCents: 2500 }) ?? ""))
  check("an empty cart is refused", codRefusal({ enabled: true, lines: [], requiresShipping: true, totalCents: 0 }) === "Your cart is empty.")
  check("a download in the cart is refused", /only for things that are delivered/.test(codRefusal({ enabled: true, lines: [{ type: "physical" }, { type: "digital" }], requiresShipping: true, totalCents: 2500 }) ?? ""))
  check("a cart that ships nothing is refused", /only for things that are delivered/.test(codRefusal({ enabled: true, lines: physical, requiresShipping: false, totalCents: 2500 }) ?? ""))
  check("nothing to pay is refused", codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 0 }) === "There is nothing to pay.")
  check("a physical cart with something to pay is taken", codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 1 }) === null)
  check("no card minimum: 1 cent is enough", codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 1 }) === null)

  console.log("\nIts own checkout row")
  const key = "k".repeat(120)
  check("the cash key ends in :cod", codClientKey("abc12345") === "abc12345:cod")
  check("never longer than client_key's 120 characters", codClientKey(key).length === 120, String(codClientKey(key).length))
  check("never the card checkout's key", codClientKey("abc12345") !== "abc12345")
  check("the same cart gives the same key (a second press finds the order)", codClientKey("abc12345") === codClientKey("abc12345"))

  console.log("\nHow an order is paid")
  check("cod, cash not in: due", paymentStateOf(COD_PROVIDER, null) === "cod_due")
  check("cod, cash in: collected", paymentStateOf(COD_PROVIDER, "2026-10-13T10:00:00Z") === "cod_collected")
  check("stripe: card", paymentStateOf("stripe", null) === "card")
  check("an older order with no provider: card", paymentStateOf(null, null) === "card")
  check("free: free", paymentStateOf("free", null) === "free")
  check("cashDue only before the cash is in", cashDue(COD_PROVIDER, null) && !cashDue(COD_PROVIDER, "2026-10-13T10:00:00Z") && !cashDue("stripe", null))

  console.log("\nSettings › Checkout")
  check("off by default", DEFAULT_CHECKOUT.cashOnDelivery === false && checkoutConfig({}).cashOnDelivery === false)
  check("an older saved config without it reads off", checkoutConfig({ buyerCancel: true }).cashOnDelivery === false)
  check("turned on, it reads on", checkoutConfig({ cashOnDelivery: true }).cashOnDelivery === true)
  check("a string is not a yes", checkoutConfig({ cashOnDelivery: "yes" }).cashOnDelivery === false)
  check("saving it keeps the rest", (() => {
    const next = mergeCheckout({ phone: "required", buyerCancel: false }, { cashOnDelivery: true })
    return next.cashOnDelivery && next.phone === "required" && next.buyerCancel === false
  })())
  const panel = read("components/app/settings/checkout-panel.tsx")
  check("the switch is in Settings › Checkout, for shops that ship", /Take cash on delivery/.test(panel) && /change\(\{ cashOnDelivery: v \}\)/.test(panel))

  console.log("\nOrders list")
  const row = (o: Partial<OrderRow>): OrderRow => ({ id: "line-1", product_id: "p1", amount_cents: 2500, status: "completed", created_at: "2026-10-13T10:00:00Z", checkout_id: "co-1", physical_fulfillment: "unfulfilled", payment_method: COD_PAYMENT_METHOD, ...o }) as OrderRow
  const [due] = groupOrders([row({ physical_cash_due: true })])
  check("cash still to collect reads Cash on delivery, not Paid", due?.payment === "cash_due", due?.payment)
  check("it is still a sale: counted, and waiting in Unfulfilled", isSale(due) && inView(due, "unfulfilled"))
  check("it is not in the Paid view yet", !inView(due, "paid"))
  const [collected] = groupOrders([row({ physical_cash_due: false })])
  check("once collected, it reads Paid", collected?.payment === "paid", collected?.payment)
  const [card] = groupOrders([row({ payment_method: "card", stripe_payment_intent_id: "pi_1" })])
  check("a card order is untouched", card?.payment === "paid", card?.payment)

  console.log("\nThe buyer's confirmation email")
  const model: OrderEmailModel = {
    shopName: "Clay Studio",
    orderNumber: "#1042",
    buyerFirstName: "Ana",
    lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 2000, imageUrl: null }],
    totals: { subtotal: 2000, discount: 0, shipping: 500, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 2500, currency: "EUR" },
    address: { line1: "1 Main St", city: "Lisbon", country: "PT" },
    deliveryName: "Standard",
    deliveryEstimate: null,
    statusUrl: "https://example.com/order",
    hasDownloads: false,
    paymentLabel: "Cash on delivery",
  }
  const cashMail = orderConfirmationEmail({ ...model, cashDue: true })
  check("says what to pay, and when", /in cash when it's delivered/.test(cashMail.html) && /in cash when it's delivered/.test(cashMail.text))
  check("the amount is the order's, in its currency", /25[.,]00/.test(cashMail.text) && /€|EUR/.test(cashMail.text))
  check("payment method reads Cash on delivery", /Payment method: Cash on delivery/.test(cashMail.text))
  const pickupMail = orderConfirmationEmail({ ...model, address: null, pickup: { name: "The studio", address: ["2 Side St"], ready: null, instructions: null }, cashDue: true })
  check("picked up: paid when it's picked up", /in cash when you pick it up/.test(pickupMail.text))
  const custom = orderConfirmationEmail({ ...model, cashDue: true, copy: { introText: "Thanks!", introHtml: "Thanks!" } as never })
  check("the shop's own words keep the cash line", /Thanks! Pay .* in cash/.test(custom.text))
  const paidMail = orderConfirmationEmail(model)
  check("a card order's email has no cash line", !/in cash/.test(paidMail.text))
  const jobs = read("lib/physical/jobs-server.ts")
  check("the job tells the email when the cash is still due", /cashDue: co\.provider === COD_PROVIDER && !co\.cod_collected_at/.test(jobs))
  check("the payment label names it", /\[COD_PAYMENT_METHOD\]: "Cash on delivery"/.test(jobs))

  console.log("\nPlacing the order (lib/physical/checkout-server.ts)")
  const server = read("lib/physical/checkout-server.ts")
  check("the cart is held to codRefusal before anything is written", /if \(cod\) \{\s*const why = codRefusal\(/.test(server))
  check("no card minimum, no card readiness for cash", /!free && !cod && totals\.totalCents < MIN_CHARGE_CENTS/.test(server) && /!free && !cod && \(!creator\.stripe_account_id/.test(server))
  check("no Storelib fee on cash", /No fee on cash on delivery[\s\S]{0,80}if \(!free && !cod\)/.test(server))
  check("written at once, like a free order", /if \(free \|\| cod\) \{\s*const done = await completeCheckout/.test(server))
  check("no seller ledger entry for cash never held", /if \(co\.provider !== COD_PROVIDER\) await step\("ledger"/.test(server))
  check("a database without part 174 is said plainly", /cod && insertError\?\.code === "23514"/.test(server))
  check("a second press returns the order already placed", /existing && cod && existing\.status === "paid" && existing\.receipt_token/.test(server))
  check("  found before the cart is priced, so taking the last units never reads as a failure", server.indexOf("if (input.cashOnDelivery === true && input.shopId)") > 0 && server.indexOf("if (input.cashOnDelivery === true && input.shopId)") < server.indexOf("const priced = await priceCheckout("))
  check("a card payment started for the same cart is stopped at Stripe before cash takes over", /\? await abandonCheckout\(db, \{ shopId: priced\.creatorId, clientKey \}\)/.test(server) && /if \(!letGo\) return \{ ok: false, status: 409/.test(server))
  check("  never let go with no word to Stripe", !/if \(card\?\.status === "pending"\) await releaseCheckout/.test(server))
  check("the cash received entry is in the currency's own decimals", /Cash on delivery received: \$\{formatMinor\(row\.total_cents \?\? 0, currencyCode\(row\.currency\) \?\? "USD", "en"\)\}/.test(read("lib/physical/orders-server.ts")))

  console.log("\nCheckout pages and routes")
  const site = read("app/api/checkout/site/route.ts")
  check("website checkout: a cod action", /case "cod":\s*return cashOnDelivery\(/.test(site))
  check("website checkout: only a cart that ships", /decision\.kind !== "ships"\) return json\(\{ error: "Cash on delivery is only/.test(site))
  check("website checkout: rate limited like a payment", /async function cashOnDelivery[\s\S]{0,1600}bucket: "payment"/.test(site))
  check("website checkout: startCheckout is told", /cashOnDelivery: true,\s*\}\)/.test(site))
  const phys = read("app/api/physical/checkout/route.ts")
  check("physical checkout: passes the buyer's choice", /cashOnDelivery: body\.cashOnDelivery === true/.test(phys))
  check("physical checkout: the buyer's session sees the order", /started\.free \|\| started\.cod/.test(phys))
  const form = read("app/checkout/parts/stripe-pay.tsx")
  check("card form: Card or Cash on delivery, beside each other", /* Changed on purpose: in the visitor's language (ct). */ /role="radiogroup" aria-label=\{ct\("How to pay"\)\}/.test(form) && /ct\("Cash on delivery"\)/.test(form))
  check("card form: Place order with cash, Pay with card", /cashOn \? \(\s*<PayButton onClick=\{\(\) => void placeCash\(\)\}/.test(form))
  check("card form: the card fields stay drawn while cash is chosen", /cashOn && "hidden"/.test(form))
  const sitePage = read("app/checkout/site/site-checkout.tsx")
  check("website page: offered only when on and every line is physical", /config\.cashOnDelivery && ships && !!quote && quote\.lines\.length > 0 && quote\.lines\.every\(\(l\) => l\.type === "physical"\)/.test(sitePage))
  check("website page: sends action cod", /action: "cod"/.test(sitePage))
  const physPage = read("app/checkout/physical/physical-checkout.tsx")
  check("physical page: offered only when on, everything physical, something to pay", /config\.cashOnDelivery && !!quote\?\.requiresShipping/.test(physPage) && /every\(\(l\) => l\.type === "physical"\)/.test(physPage))
  check("physical page: a dropped connection keeps the cash key", /if \(!cashOn\) clientKey\.current = actionKey\(\)/.test(physPage))
  const success = read("app/checkout/parts/success.tsx")
  check("the overlay says Order placed, never Payment complete", /cash \? ct\("Order placed"\)/.test(success))
  const status = read("app/checkout/physical/order/[token]/order-status-view.tsx")
  check("the buyer's order page says what to pay", /in cash when it's delivered/.test(status) && /Paid in cash\./.test(status))
  const thanks = read("app/checkout/site/thanks/[token]/page.tsx")
  check("the website thank you page says what to pay", /cashWhen: co\.provider === "cod"/.test(thanks))

  console.log("\nThe seller's side")
  const panelOrder = read("components/physical/order-panel.tsx")
  check("order panel: Mark as paid on a cash order still due", /order\.payment === "cod_due"/.test(panelOrder) && /action: "cash_collected"/.test(panelOrder))
  check("order panel: a cancelled cash order has nothing to refund", /nothing to refund/.test(panelOrder))
  const route = read("app/api/physical/orders/[id]/route.ts")
  check("orders route: cash_collected marks it", /case "cash_collected"/.test(route) && /markCashCollected\(/.test(route))
  const orders = read("lib/physical/orders-server.ts")
  check("marked once, only a paid cash order not cancelled", /\.eq\("provider", COD_PROVIDER\)\s*\.eq\("status", "paid"\)\s*\.is\("cancelled_at", null\)\s*\.is\("cod_collected_at", null\)/.test(orders))
  const detail = read("app/app/orders/order-detail.tsx")
  check("refund: a cash order only once the cash is in", /l\.payment_method === COD_PAYMENT_METHOD && l\.physical_cash_due === false/.test(detail))
  const refund = read("app/api/stripe/refund/route.ts")
  check("refund route: refuses cash not yet collected", /hasn't been paid yet: the cash is collected on delivery/.test(refund))
  check("refund route: nothing sent to Stripe for cash", /if \(byCash\) \{[\s\S]{0,200}refund = \{ id: `cash_/.test(refund) && /!onAirwallex && !byCash\) \{\s*try \{\s*const pi = await stripe/.test(refund))
  const list = read("lib/orders/load-rows.ts")
  check("orders list reads whether the cash is in", /r\.physical_cash_due = c\.provider === "cod" && !c\.cod_collected_at/.test(list))

  console.log("\nThe database (SQL part 174)")
  const sql = read("supabase/sql/run-now/174_cash_on_delivery.sql")
  check("the provider check takes cod", /'cod'/.test(sql) && /commerce_checkouts_provider_check/.test(sql))
  check("cod_collected_at is added", /ADD COLUMN IF NOT EXISTS cod_collected_at timestamptz/i.test(sql))
  check("the migration is the same text", read("supabase/migrations/20270114_cash_on_delivery.sql").trim() === sql.trim())
  check("listed in the run-now README", /174_cash_on_delivery\.sql/.test(read("supabase/sql/run-now/README.md")))
  check("checked after running", /p174_cash_on_delivery/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()

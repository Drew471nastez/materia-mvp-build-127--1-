/**
 * Cash on delivery (lib/physical/cash-on-delivery.ts): the rules a cart is
 * held to, the order's payment state, the seller's switch, how the Orders
 * list and the buyer's email read it, and that every surface that takes the
 * order (checkout routes, the card form, the order panel, refunds, the SQL
 * part) is wired to the same rules.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COD_PAYMENT_METHOD, COD_PROVIDER, cashDue, codClientKey, codCountryAllowed, codRefusal, paymentStateOf } from "@/lib/physical/cash-on-delivery"
import { physicalTotals } from "@/lib/physical/totals"
import { DEFAULT_CHECKOUT, checkoutConfig, mergeCheckout } from "@/lib/store/checkout-config"
import { groupOrders, inView, isSale, type OrderRow } from "@/lib/orders/order-view"
import { orderConfirmationEmail, refundEmail, type OrderEmailModel } from "@/lib/physical/email-templates"

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
  /* Cancelled before the cash came in: no money moved, so no sale anywhere (Home, Analytics, the SQL behind them all read "failed" as no sale). */
  const [voided] = groupOrders([row({ status: "failed", physical_cash_due: true, physical_fulfillment: "cancelled" })])
  check("cancelled before the cash came in, it reads Voided", voided?.payment === "voided", voided?.payment)
  check("  and is no sale: out of revenue and the order count", !isSale(voided))
  const [failedCard] = groupOrders([row({ status: "failed", payment_method: "card" })])
  check("  a card payment that failed still reads Failed", failedCard?.payment === "failed", failedCard?.payment)
  check("  cancelling an uncollected cash order takes its lines out of the sales, and only then", /if \(order\.payment === "cod_due"\) await db\.from\("orders"\)\.update\(\{ status: "failed" \}\)\.eq\("checkout_id", checkoutId\)\.eq\("payment_method", COD_PAYMENT_METHOD\)/.test(read("lib/physical/orders-server.ts")))

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
  check("the payment label names it", /* Changed on purpose: in the buyer's language (lib/emails/words.ts). */ /\[COD_PAYMENT_METHOD\]: et\("Cash on delivery"\)/.test(jobs))

  console.log("\nPlacing the order (lib/physical/checkout-server.ts)")
  const server = read("lib/physical/checkout-server.ts")
  check("the cart is held to codRefusal before anything is written", /if \(cod\) \{\s*const why = codRefusal\(/.test(server))
  /* Changed on purpose: the card minimum is the store's own currency's (lib/store/selling-currency minimumChargeMinor). */
  check("no card minimum, no card readiness for cash", /!free && !cod && totals\.totalCents < minimumChargeMinor\(storeCurrency\)/.test(server) && /!free && !cod && \(!creator\.stripe_account_id/.test(server))
  check("no Storelib fee on cash", /No fee on cash on delivery[\s\S]{0,80}if \(!free && !cod\)/.test(server))
  check("written at once, like a free order", /if \(free \|\| cod\) \{\s*const done = await completeCheckout/.test(server))
  check("no seller ledger entry for cash never held", /* Round AE: the steps are recorded (lib/checkout/followups.ts). */ /if \(co\.provider !== COD_PROVIDER\) await f\.idempotent\("ledger"/.test(server))
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
  const form = read("app/(storelib)/checkout/parts/stripe-pay.tsx")
  check("card form: Card or Cash on delivery, beside each other", /* Changed on purpose: in the visitor's language (ct). */ /role="radiogroup" aria-label=\{ct\("How to pay"\)\}/.test(form) && /ct\("Cash on delivery"\)/.test(form))
  check("card form: Place order with cash, Pay with card", /cashOn \? \(\s*<PayButton onClick=\{\(\) => void placeCash\(\)\}/.test(form))
  check("card form: the card fields stay drawn while cash is chosen", /cashOn && "hidden"/.test(form))
  const sitePage = read("app/(storelib)/checkout/site/site-checkout.tsx")
  /* Changed on purpose: something to pay, and a country the shop takes cash in. */
  check("website page: offered only when on and every line is physical", /config\.cashOnDelivery &&\s*ships &&\s*!!quote &&\s*quote\.lines\.length > 0 &&\s*quote\.lines\.every\(\(l\) => l\.type === "physical"\)/.test(sitePage))
  check("website page: sends action cod", /action: "cod"/.test(sitePage))
  const physPage = read("app/(storelib)/checkout/physical/physical-checkout.tsx")
  check("physical page: offered only when on, everything physical, something to pay", /config\.cashOnDelivery &&\s*!!quote\?\.requiresShipping/.test(physPage) && /every\(\(l\) => l\.type === "physical"\)/.test(physPage))
  check("physical page: a dropped connection keeps the cash key", /if \(!cashOn\) clientKey\.current = actionKey\(\)/.test(physPage))
  const success = read("app/(storelib)/checkout/parts/success.tsx")
  check("the overlay says Order placed, never Payment complete", /cash \? ct\("Order placed"\)/.test(success))
  const status = read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")
  check("the buyer's order page says what to pay", /in cash when it's delivered/.test(status) && /Paid in cash\./.test(status))
  const thanks = read("app/(storelib)/checkout/site/thanks/[token]/page.tsx")
  check("the website thank you page says what to pay", /cashWhen: co\.provider === "cod"/.test(thanks))

  console.log("\nThe seller's side")
  const panelOrder = read("components/physical/order-panel.tsx")
  check("order panel: Mark as paid on a cash order still due", /order\.payment === "cod_due"/.test(panelOrder) && /action: "cash_collected"/.test(panelOrder))
  check("order panel: a cancelled cash order has nothing to refund", /nothing to refund/.test(panelOrder))
  const route = read("app/api/physical/orders/[id]/route.ts")
  check("orders route: cash_collected marks it", /case "cash_collected"/.test(route) && /markCashCollected\(/.test(route))
  const orders = read("lib/physical/orders-server.ts")
  check("marked once, only a paid cash order not cancelled", /\.eq\("provider", COD_PROVIDER\)\s*\.eq\("status", "paid"\)\s*\.is\("cancelled_at", null\)\s*\.is\("cod_collected_at", null\)/.test(orders))
  const detail = read("app/(storelib)/app/orders/order-detail.tsx")
  /* Round AD2: the rule moved to lib/orders/order-view canRefundLine, which the order page filters its lines by. */
  check("refund: a cash order only once the cash is in", /row\.payment_method === "cash_on_delivery" && row\.physical_cash_due === false/.test(read("lib/orders/order-view.ts")) && /order\.lines\.filter\(canRefundLine\)/.test(detail))
  const refund = read("app/api/stripe/refund/route.ts")
  check("refund route: refuses cash not yet collected", /hasn't been paid yet: the cash is collected on delivery/.test(refund))
  check("refund route: nothing sent to Stripe for cash", /if \(byCash\) \{[\s\S]{0,200}refund = \{ id: `cash_/.test(refund) && /if \(!byCash\) \{\s*try \{\s*const pi = await stripe/.test(refund))
  const list = read("lib/orders/load-rows.ts")
  check("orders list reads whether the cash is in", /r\.physical_cash_due = c\.provider === "cod" && !c\.cod_collected_at/.test(list))

  console.log("\nThe database (SQL part 174)")
  const sql = read("supabase/sql/run-now/174_cash_on_delivery.sql")
  check("the provider check takes cod", /'cod'/.test(sql) && /commerce_checkouts_provider_check/.test(sql))
  check("cod_collected_at is added", /ADD COLUMN IF NOT EXISTS cod_collected_at timestamptz/i.test(sql))
  check("the migration is the same text", read("supabase/migrations/20270114_cash_on_delivery.sql").trim() === sql.trim())
  check("listed in the run-now README", /174_cash_on_delivery\.sql/.test(read("supabase/sql/run-now/README.md")))
  check("checked after running", /p174_cash_on_delivery/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nWhere, a fee and a note (Settings › Checkout)")
  {
    const c = checkoutConfig({ cashOnDelivery: true, codCountries: ["ro", "RO", "md", "nope", 3], codFeeCents: "1050", codInstructions: "  Have   the exact amount   ready.  " })
    check("countries are two letter codes, once each", c.codCountries.join() === "RO,MD", c.codCountries.join())
    check("the fee is whole hundredths", c.codFeeCents === 1050)
    check("the note is one tidy line", c.codInstructions === "Have the exact amount ready.")
    check("nothing set is everywhere, no fee, no note", DEFAULT_CHECKOUT.codCountries.length === 0 && DEFAULT_CHECKOUT.codFeeCents === 0 && DEFAULT_CHECKOUT.codInstructions === "")
    check("a fee below zero or past the cap is refused", checkoutConfig({ codFeeCents: -5 }).codFeeCents === 0 && checkoutConfig({ codFeeCents: 10_000_000 }).codFeeCents === 100_000)
    const physical = [{ type: "physical" }]
    check("a country not on the list is refused", /isn't available for this address/.test(codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 2500, countries: ["RO"], country: "DE" }) ?? ""))
    check("a country on it is not", codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 2500, countries: ["RO"], country: "ro" }) === null)
    check("a pickup is never held to the list", codRefusal({ enabled: true, lines: physical, requiresShipping: true, totalCents: 2500, countries: ["RO"], country: null }) === null)
    check("an empty list is everywhere", codCountryAllowed([], "DE") && codCountryAllowed(undefined, "DE"))
  }

  console.log("\nThe fee is in the total the buyer sees and the order keeps")
  {
    const lines = [{ productId: "p", unitCents: 2000, quantity: 1, discountCents: 0, taxable: true, digital: false }]
    const plain = physicalTotals(lines, { shippingCents: 500 })
    const fee = physicalTotals(lines, { shippingCents: 500, codFeeCents: 300 })
    check("added once to the total", fee.totalCents === plain.totalCents + 300 && fee.codFeeCents === 300 && plain.codFeeCents === 0, JSON.stringify([plain.totalCents, fee.totalCents]))
    const freeShip = physicalTotals(lines, { shippingCents: 500, freeShipping: true, codFeeCents: 300 })
    check("a free shipping code doesn't take it off", freeShip.totalCents === 2000 + 300, JSON.stringify(freeShip))
    const tax = { mode: "manual" as const, pricesIncludeTax: false, taxOnShipping: true, rates: [{ id: "r", country: "RO", region: null, rateBps: 1900, name: "VAT" }] }
    const taxed = physicalTotals(lines, { shippingCents: 500, codFeeCents: 300, tax: tax as never, country: "RO" })
    check("taxed as delivery is", taxed.taxCents === Math.round((2000 + 500 + 300) * 0.19), JSON.stringify(taxed))
    const server = read("lib/physical/checkout-server.ts")
    check("startCheckout prices with the fee only when cash is asked and on", /const wantsCod = input\.cashOnDelivery === true && config\.cashOnDelivery/.test(server) && /codFeeCents: wantsCod \? config\.codFeeCents : 0/.test(server))
    check("a cart with nothing else to pay is placed free, never for a fee alone", /a fee alone is never charged/.test(server))
    check("the fee is kept inside the delivery charge and named", /shipping_cents: totals\.shippingCents \+ totals\.codFeeCents/.test(server) && /cod_fee_cents: totals\.codFeeCents/.test(server))
    check("the server checks the delivery country", /countries: config\.codCountries, country: pickup \? null : \(address\?\.country \?\? null\)/.test(server))
    const quote = read("lib/checkout/site-quote-server.ts")
    check("both quotes ask with the payment method, so the page shows the server's total", /export async function codFeeFor/.test(quote) && /* The city rides along since the carrier rates fix (lib/integrations/shipping/checkout-rates-server.ts). */ /quoteCheckout\(db, priced, country \? \{ country, region, postalCode, city \} : null, body\.deliveryOptionId, \{ codFeeCents \}\)/.test(quote) && /codFeeFor\(db, priced\.creatorId, body, country\)/.test(read("app/api/physical/checkout/quote/route.ts")))
    const site = read("app/(storelib)/checkout/site/site-checkout.tsx")
    const shipped = read("app/(storelib)/checkout/physical/physical-checkout.tsx")
    check("the website checkout asks again when cash is chosen and shows the fee line", /byCash && config\.cashOnDelivery \? \{ cashOnDelivery: true \}/.test(site) && /data-cod-fee/.test(site) && /onChoose: setByCash/.test(site))
    check("so does the shipped checkout", /byCash && config\.cashOnDelivery \? \{ cashOnDelivery: true \}/.test(shipped) && /data-cod-fee/.test(shipped))
    check("both offer cash only for a country on the list", /codCountryAllowed\(config\.codCountries, address\.country\)/.test(site) && /codCountryAllowed\(config\.codCountries, address\.country\)/.test(shipped))
    check("both show the shop's note under the choice", /instructions: config\.codInstructions/.test(site) && /config\.codInstructions \?/.test(shipped))
    const mail = orderConfirmationEmail({ ...model, totals: { ...model.totals, shipping: 800, total: 2800, codFee: 300 }, cashDue: true, cashNote: "Have the exact amount ready." })
    check("the email shows the fee on its own row, shipping without it", /Cash on delivery fee: \D*3[.,]00/.test(mail.text) && /Shipping: \D*5[.,]00/.test(mail.text), mail.text)
    check("and the shop's note after what to pay", /in cash when it's delivered\. Have the exact amount ready\./.test(mail.text))
  }

  console.log("\nRefused, not picked up, and the bugs the audit found")
  {
    const orders = read("lib/physical/orders-server.ts")
    check("refused on delivery: only a cash order still to collect", /export async function refusedOnDelivery/.test(orders) && /order\.payment !== "cod_due"/.test(orders))
    check("what went out comes back as a return the shop opened, restocked when received", /openReturn\(db, checkoutId, \{ creatorId, by: "creator", items, method: "ship_back", note: "Refused on delivery" \}\)/.test(orders) && /restock: true/.test(orders))
    check("nothing is refunded; the lines stop being a sale; the order is cancelled with the reason", /cancel_reason: "Refused on delivery"/.test(orders) && /update\(\{ status: "failed" \}\)\.eq\("checkout_id", checkoutId\)\.eq\("payment_method", COD_PAYMENT_METHOD\)/.test(orders))
    const route = read("app/api/physical/orders/[id]/route.ts")
    check("the order route takes it", /case "cash_refused"/.test(route) && /refusedOnDelivery\(/.test(route))
    const panel = read("components/physical/order-panel.tsx")
    check("the order panel offers it beside Mark as paid, asked first", /action: "cash_refused"/.test(panel) && /Refused on delivery/.test(panel) && /Not picked up/.test(panel))
    const siteRoute = read("app/api/checkout/site/route.ts")
    check("a cart a code takes to 0 is placed once, never answered 'press Place order' after it was placed", !/This order is free\. Press Place order\./.test(siteRoute) && /res\.ok && res\.data\.free && typeof res\.data\.thanks === "string"/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")))
    check("a voided cash order never reads paid on the timeline", /order\.payment === "voided"/.test(read("lib/orders/timeline.ts")))
    check("You receive waits until the cash is collected", /order\.payment === "cash_due" \? 0 : order\.totalCents/.test(read("app/(storelib)/app/orders/order-detail.tsx")))
    check("the thank you page stops asking for cash once collected or cancelled", /co\.provider === "cod" && !co\.cod_collected_at && !co\.cancelled_at/.test(read("app/(storelib)/checkout/site/thanks/[token]/page.tsx")))
    check("a second Place order racing the first gets the placed order", /the other press wrote it first/.test(read("lib/physical/checkout-server.ts")))
    check("a cash order that failed to save gives its code's place back", /if \(holder && priced\.coupon\) await releaseCouponHold\(db, priced\.coupon\.id, holder\)/.test(read("lib/physical/checkout-server.ts")))
    const refund = refundEmail({ shopName: "Clay", orderNumber: "#1", buyerFirstName: "Ana", amountCents: 500, refundedCents: 500, totalCents: 2500, currency: "EUR", paymentLabel: "Cash on delivery", statusUrl: "https://example.com", cash: true })
    check("a cash refund's email names no card or bank", /give it back to you directly/.test(refund.text) && !/to your Cash on delivery|Banks usually/.test(refund.text), refund.text)
    check("the seller's sale email says to collect cash, not that money goes to the balance", /cashDue: co\.provider === "cod"/.test(read("lib/notify/seller-commerce.ts")) && /Total to collect/.test(read("lib/notify/templates/catalog.ts")) && /if \(net !== null && netText && !cash\)/.test(read("lib/notify/templates/catalog.ts")))
    const due = groupOrders([{ id: "1", product_id: "p", amount_cents: 2500, currency: "eur", status: "completed", created_at: "2026-10-01T00:00:00Z", payment_method: COD_PAYMENT_METHOD, physical_cash_due: true } as unknown as OrderRow])
    check("Orders has a Cash to collect view with it in", due.length === 1 && inView(due[0], "cash") && !inView(due[0], "paid"), due[0]?.payment)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()

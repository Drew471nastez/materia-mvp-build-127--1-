/**
 * Settings › Taxes, end to end: every switch and every region change moves
 * the money at the three checkouts (the single product checkout, the
 * website basket at /checkout/cart, the physical checkout), and the tax is
 * kept on the order and shown on the receipt.
 *
 *   control                         saved                                consumed
 *   Charge tax                      commerce_settings.tax_mode           digitalTax, basketTax, physicalTotals (mode)
 *   Included / Added on top         commerce_settings.prices_include_tax all three (included)
 *   Charge tax on shipping          commerce_settings.tax_on_shipping    physicalTotals (taxOnShipping)
 *   Charge tax on digital products  commerce_settings.tax_digital        digitalTax, basketTax, physicalTotals (digital lines)
 *   Tax regions                     commerce_tax_rates                   regionFor / rateRowFor at each checkout
 *   Product rates                   commerce_tax_overrides               rateForProduct / own map in physicalTotals
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/tax-settings-wiring.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { physicalTotals, type TaxSettings, type TotalsLine } from "@/lib/physical/totals"
import { TAX_REGION_RULES, basketTax, checkoutTaxFor, digitalTax } from "@/lib/tax/rules"
import { lineTotalCents, packItems, unpackItems } from "@/lib/checkout/cart-items"
import { invoiceForOrder, type OrderRow } from "@/lib/checkout/invoice"
import { groupOrders } from "@/lib/orders/order-view"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const RO = { id: "r-ro", country: "RO", region: null, name: "VAT", rateBps: 1900 }
const US_CA = { id: "r-ca", country: "US", region: "CA", name: "Sales tax", rateBps: 725 }
const US = { id: "r-us", country: "US", region: null, name: "Sales tax", rateBps: 500 }

/* A mixed cart: a shipped item, a download, and delivery. */
const MIXED: TotalsLine[] = [
  { productId: "mug", unitCents: 2000, quantity: 2, discountCents: 0, taxable: true },
  { productId: "ebook", unitCents: 1000, quantity: 1, discountCents: 0, taxable: true, digital: true },
]
const settings = (over: Partial<TaxSettings>): TaxSettings => ({ mode: "manual", pricesIncludeTax: false, taxOnShipping: false, digital: false, rates: [RO, US, US_CA], ...over })

console.log("\nPhysical checkout: every combination of the switches\n")
{
  /* 4000 of shipped items, 1000 of download, 500 of delivery, 19% in Romania. */
  const table: { shipping: boolean; digital: boolean; included: boolean; tax: number; total: number }[] = []
  for (const shipping of [false, true])
    for (const digital of [false, true])
      for (const included of [false, true]) {
        const t = physicalTotals(MIXED, { shippingCents: 500, tax: settings({ taxOnShipping: shipping, digital, pricesIncludeTax: included }), country: "RO", region: null })
        const taxed = (amount: number) => (included ? Math.round(amount - (amount * 10_000) / 11_900) : Math.round((amount * 1900) / 10_000))
        const expectTax = taxed(4000 + (digital ? 1000 : 0)) + (shipping ? taxed(500) : 0)
        const expectTotal = 5500 + (included ? 0 : expectTax)
        table.push({ shipping, digital, included, tax: t.taxCents, total: t.totalCents })
        check(`shipping ${shipping ? "on " : "off"} · digital ${digital ? "on " : "off"} · ${included ? "included" : "on top  "}: tax ${expectTax}, total ${expectTotal}`, t.taxCents === expectTax && t.totalCents === expectTotal && t.taxIncluded === included, t)
      }
  check("turning Charge tax on shipping on adds 19% of the delivery, and nothing else", table[4].tax - table[0].tax === 95)
  check("turning Charge tax on digital products on taxes the download in a mixed cart (it used to be taxed with the switch off)", table[2].tax - table[0].tax === 190)
  const off = physicalTotals(MIXED, { shippingCents: 500, tax: settings({ mode: "none", taxOnShipping: true, digital: true }), country: "RO" })
  check("Charge tax off: nothing, whatever else is on", off.taxCents === 0 && off.totalCents === 5500)
  const noDigitalKey = physicalTotals(MIXED, { shippingCents: 0, tax: { mode: "manual", pricesIncludeTax: false, taxOnShipping: false, rates: [RO] }, country: "RO" })
  check("settings read before tax_digital existed tax only the shipped items", noDigitalKey.taxCents === 760, noDigitalKey)
  const notTaxable = physicalTotals([{ ...MIXED[0], taxable: false }], { shippingCents: 0, tax: settings({}), country: "RO" })
  check("a product marked not taxable is never taxed", notTaxable.taxCents === 0)
}

console.log("\nPhysical checkout: regions\n")
{
  const tax = settings({ taxOnShipping: true })
  check("a state's own rate before its country's (California 7.25%, the rest of the US 5%)", physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax, country: "US", region: "CA" }).taxCents === 290 && physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax, country: "US", region: "NY" }).taxCents === 200)
  check("  and the state's full name matches its code", physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax, country: "US", region: "California" }).taxCents === 290)
  check("a country in no region pays no tax", physicalTotals(MIXED, { shippingCents: 500, tax, country: "DE" }).taxCents === 0)
  const created = physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax: settings({ rates: [] }), country: "RO" })
  const afterCreate = physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax: settings({ rates: [RO] }), country: "RO" })
  const afterEdit = physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax: settings({ rates: [{ ...RO, rateBps: 900 }] }), country: "RO" })
  check("create a region: tax appears; edit its rate: tax follows; delete it: tax is gone", created.taxCents === 0 && afterCreate.taxCents === 760 && afterEdit.taxCents === 360)
  const own = physicalTotals(MIXED, { shippingCents: 0, tax: settings({ digital: true, overrides: [{ taxRateId: "r-ro", productId: "ebook", rateBps: 500 }] }), country: "RO" })
  check("a product rate replaces the region's rate for that one product", own.taxCents === 760 + 50, own)
}

console.log("\nSingle product (digital) checkout\n")
{
  const setup = { enabled: true, digital: true, included: false, regions: [RO, US, US_CA], overrides: [] }
  check("Charge tax on digital products off: the price and nothing more", checkoutTaxFor({ ...setup, digital: false }, "p", "RO") === null && digitalTax({ ...setup, digital: false }, { taxableCents: 1000, tipCents: 0, productId: "p", country: "RO" }).totalCents === 1000)
  check("on: 19% added in Romania", digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "p", country: "RO" }).totalCents === 1190)
  check("included: the total does not move, the tax is the part that was tax", (() => { const t = digitalTax({ ...setup, included: true }, { taxableCents: 1190, tipCents: 0, productId: "p", country: "RO" }); return t.totalCents === 1190 && t.taxCents === 190 })())
  check("a digital sale has no state: a US buyer pays the country row, never California's", digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "p", country: "US" }).taxCents === 50)
  check("the page is only sent whole-country rows", checkoutTaxFor(setup, "p", "US")!.regions.every((r) => r.id !== "r-ca"))
}

console.log("\nWebsite basket (the website's own checkout, and Storelib's basket session)\n")
{
  const setup = { enabled: true, digital: true, included: false, regions: [RO, US, US_CA], overrides: [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }] }
  const lines = [{ productId: "course", taxableCents: 4900 }, { productId: "book", taxableCents: 1000 }]
  const ro = basketTax(setup, lines, "ro")
  check("each line at its rate in the buyer's country: 19% of 49.00 and the book at 5%", ro.lineTaxCents[0] === 931 && ro.lineTaxCents[1] === 50 && ro.taxCents === 981 && ro.country === "RO" && ro.name === "VAT", ro)
  check("nothing when tax is off, digital is off, there is no country, or the country is in no region", [basketTax({ ...setup, enabled: false }, lines, "RO"), basketTax({ ...setup, digital: false }, lines, "RO"), basketTax(setup, lines, null), basketTax(setup, lines, "DE")].every((t) => t.taxCents === 0 && t.lineTaxCents.every((x) => x === 0)))
  check("a basket has no address: only whole-country rows count", basketTax({ ...setup, regions: [US_CA] }, lines, "US").taxCents === 0 && basketTax(setup, lines, "US").taxCents === 245 + 50)
  const inc = basketTax({ ...setup, included: true }, [{ productId: "course", taxableCents: 1190 }], "RO")
  check("prices including tax: the tax inside each line", inc.included && inc.taxCents === 190)
  check("the same as the single product checkout charges for the same product alone", basketTax(setup, [{ productId: "x", taxableCents: 1000 }], "RO").taxCents === digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "x", country: "RO" }).taxCents)

  const packed = packItems([
    { productId: "11111111-1111-1111-1111-111111111111", variantId: null, quantity: 1, priceCents: 4900, discountCents: 0, taxCents: 931 },
    { productId: "22222222-2222-2222-2222-222222222222", variantId: null, quantity: 1, priceCents: 1000, discountCents: 100, taxCents: 0 },
  ])
  const back = unpackItems(packed)
  check("each line's tax rides through Stripe's metadata and back, beside its discount", packed.cart_tax === "931,0" && back[0].taxCents === 931 && back[1].taxCents === undefined && back[1].discountCents === 100, packed)
  check("  and a basket with no tax carries no tax key, so older baskets read the same", !("cart_tax" in packItems([{ productId: "11111111-1111-1111-1111-111111111111", variantId: null, quantity: 1, priceCents: 100 }])))
  check("  the line's charged amount stays its price after the code (the tax is its own Stripe line)", lineTotalCents(back[0]) === 4900)

  const route = read("app/api/checkout/cart/route.ts")
  check("the basket route works the tax out with basketTax from the store's settings and the request's country", /basketTax\(\s*await loadTaxForCheckout\(admin, creatorId\)/.test(route) && /detectedCountry\(request\.headers\)/.test(route))
  check("  added on top it is its own line on Stripe's form", /addedTaxCents > 0\s*\? \[\{ quantity: 1, price_data: \{ currency: chargeCurrency, unit_amount: addedTaxCents/.test(route))
  check("  the tax and each line's share go on the session", /tax_cents: String\(tax\.taxCents\)/.test(route) && /lines\[i\]\.item\.taxCents = t/.test(route))
  check("  Storelib's fee stays on the price, never on the tax", /calculatePlatformFeeForCheckout\(totalCents, creatorId/.test(route))
  const quote = read("lib/checkout/site-quote-server.ts")
  check("the website's own checkout (/checkout on the site) shows the same tax for a cart of downloads", /basketTax\(await loadTaxForCheckout\(db, creatorId\)/.test(quote) && /taxCents: tax\.taxCents, taxIncluded: tax\.included, totalCents: priced\.totalCents \+ \(tax\.included \? 0 : tax\.taxCents\)/.test(quote))
  const site = read("app/api/checkout/site/route.ts")
  check("  and its Pay charges it: the amount, each line's share and the tax on the payment", /const tax = await digitalCartTax\(admin, site\.creatorId, priced, body, detectedCountry\(request\.headers\)\)/.test(site) && /amount: chargeCents,/.test(site) && /* Changed on purpose (overhaul): the tax in the currency it is charged in. */ /tax_cents: String\(taxCharged\)/.test(site) && /priced\.lines\[i\]\.item\.taxCents = t/.test(site))
  check("  the fee stays on the price there too", /* Changed on purpose (overhaul): on the goods as charged, in the market's currency when it is charged in it. */ /calculatePlatformFeeForCheckout\(goodsCharged, site\.creatorId/.test(site) && /let goodsCharged = priced\.totalCents/.test(site))
  check("  and its paid order keeps the tax", (read("lib/checkout/fulfil-cart-session.ts").match(/tax: metadata\.tax_cents \? \{ included: metadata\.tax_included === "true"/g) ?? []).length === 2)
  const line = read("lib/checkout/fulfil-cart-item.ts")
  check("each basket order is charged its share of added tax and keeps its tax", /lineTotalCents\(line\) \+ \(ctx\.tax\?\.included \? 0 : taxCents\)/.test(line) && /update\(\{ tax_cents: Math\.min\(taxCents, amountCents\), tax_country: country \}\)/.test(line) && /update\(\{ tax_included: true \}\)/.test(line))
  check("  the session's tax settings reach the lines", /tax: metadata\.tax_cents \? \{ included: metadata\.tax_included === "true"/.test(read("lib/checkout/fulfil-cart-session.ts")))
}

console.log("\nPhysical checkout reads the switches\n")
{
  const config = read("lib/physical/config-server.ts")
  check("tax_digital is read with the other switches", /taxDigital: data\.tax_digital === true/.test(config) && /digital: s\.taxDigital/.test(config))
  check("every line says whether it is digital", /digital: l\.type !== "physical"/.test(read("lib/physical/checkout-pricing-server.ts")))
  const server = read("lib/physical/checkout-server.ts")
  check("the checkout keeps the tax and whether it was included, and adds a Tax line when on top", /tax_cents: totals\.taxCents/.test(server) && /tax_included: totals\.taxIncluded/.test(server) && /totals\.taxCents > 0 && !totals\.taxIncluded/.test(server))
  const settingsApi = read("lib/tax/server.ts")
  check("the switches are written where the checkouts read them", /row\.tax_on_shipping = body\.onShipping/.test(settingsApi) && /row\.tax_digital = body\.digital/.test(settingsApi) && /row\.prices_include_tax = body\.included/.test(settingsApi) && /row\.tax_mode = body\.enabled \? "manual" : "none"/.test(settingsApi))
  check("regions are created, edited and deleted only for the caller's own store", /insert\(\{ creator_id: creatorId, country, region, name, rate_bps: bps \}\)/.test(settingsApi) && /update\(patch\)\.eq\("id", id\)\.eq\("creator_id", creatorId\)/.test(settingsApi) && /delete\(\)\.eq\("id", id\)\.eq\("creator_id", creatorId\)/.test(settingsApi))
}

console.log("\nReceipts and orders\n")
{
  const load = read("lib/receipts/load.ts")
  check("the receipt reads each order's tax in its own read, so an older database still shows it", /async function readTax/.test(load) && /select\("id, tax_cents, tax_included"\)/.test(load) && /select\("id, tax_cents"\)/.test(load))
  check("  tax added on top comes out of the subtotal, so Subtotal + Tax = Total", /if \(taxCents > 0 && !taxIncluded\) totals\.subtotalCents = Math\.max\(0, totals\.subtotalCents - taxCents\)/.test(load))
  const view = read("app/(storelib)/receipt/[token]/receipt-view.tsx")
  check("the receipt page shows Tax, or Including tax", /* Changed on purpose: in the buyer's language (ct). */ /<Row label=\{receipt\.taxLabel \|\| ct\("Tax"\)\} value=\{money\(receipt\.taxCents \?\? 0\)\} \/>/.test(view) && /<Row label=\{includedTax\}/.test(view) && /ct\("Including tax"\)/.test(view) && /<Row label=\{ct\("Total"\)\}/.test(view))
  const mail = read("lib/receipts/email.ts")
  check("the receipt email too", /\{ label: taxName\(m\), value: m\.taxText \}/.test(mail) && /\{ label: includedName\(m\), value: m\.taxText \}/.test(mail) && /\|\| et\("Tax"\)/.test(mail) && /taxText: \(v\.taxCents \?\? 0\) > 0/.test(read("lib/email.tsx")))
  const [sale] = groupOrders([
    { id: "o1", product_id: "p1", amount_cents: 5831, tip_cents: 0, status: "completed", created_at: "2026-10-01T10:00:00Z", stripe_session_id: "cs_1", tax_cents: 931, tax_included: false },
    { id: "o2", product_id: "p2", amount_cents: 1050, tip_cents: 0, status: "completed", created_at: "2026-10-01T10:00:01Z", stripe_session_id: "cs_1", tax_cents: 50, tax_included: false },
  ] as never)
  check("Orders in the app: Subtotal + Tax = Total for a taxed basket", sale.taxCents === 981 && !sale.taxIncluded && sale.subtotalCents === 5900 && sale.totalCents === 6881, sale && { tax: sale.taxCents, sub: sale.subtotalCents })
  check("  the order page shows the Tax row and each line at its price", /<Row label=(?:"Tax"|\{order\.taxLabel \|\| "Tax"\}) value=\{formatMoney\(order\.taxCents, order\.currency\)\} \/>/.test(read("app/(storelib)/app/orders/order-detail.tsx")) && /line\.tax_included \? 0 : line\.tax_cents/.test(read("app/(storelib)/app/orders/order-detail.tsx")) && /tax_cents: Number\(order\.tax_cents\) \|\| 0/.test(read("lib/orders/load-rows.ts")))
  check("the single product checkout records whether its tax was included", /update\(\{ tax_included: true \}\)/.test(read("lib/checkout/fulfil-payment.ts")))
  check("physical order emails show tax from the checkout", /tax: co\.tax_cents/.test(read("lib/physical/jobs-server.ts")) && /* Changed on purpose: in the buyer's language (lib/emails/words.ts). */ /t\.taxIncluded \? et\("Including \{tax\}"/.test(read("lib/physical/email-templates.ts")) && /taxLabel: typeof co\.shipping_rate\?\.tax_label/.test(read("lib/physical/jobs-server.ts")))
}

console.log("\nA basket's invoice\n")
const invoiceDone = (async () => {
  /* A database that answers nothing: the seller's name falls back, which is all this needs. */
  const none: any = { from: () => none, select: () => none, eq: () => none, in: () => none, order: () => none, limit: () => none, maybeSingle: async () => ({ data: null, error: null }), then: (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f) } // eslint-disable-line @typescript-eslint/no-explicit-any
  const row = (id: string, amount: number, tax: number, at: string, productId: string): OrderRow => ({ id, created_at: at, status: "completed", amount_cents: amount, tip_cents: 0, buyer_email: "a@b.co", buyer_first_name: "Ada", buyer_last_name: null, payment_method: "card", card_brand: "visa", card_last4: "4242", product_id: productId, variant_name: null, stripe_payment_intent_id: "pi_1", stripe_session_id: "cs_1", tax_cents: tax, tax_included: false, product: { title: productId === P1 ? "Course" : "Book", creator_id: null } }) as OrderRow
  const P1 = "11111111-1111-1111-1111-111111111111"
  const P2 = "22222222-2222-2222-2222-222222222222"
  const rows = [row("o1", 4900 + 931, 931, "2026-10-01T10:00:00Z", P1), row("o2", 1000 + 50, 50, "2026-10-01T10:00:01Z", P2)]
  const inv = await invoiceForOrder(none, rows[0], { basket: rows, items: [{ productId: P1, variantId: null, quantity: 1, priceCents: 4900 }, { productId: P2, variantId: null, quantity: 1, priceCents: 1000 }], business: null, discountCode: null })
  check("the lines are their prices, the tax its own row, and they add up to what was charged", !!inv && inv.lines.map((l) => l.amountCents).join() === "4900,1000" && inv.taxCents === 981 && !inv.taxIncluded && inv.subtotalCents + (inv.taxCents ?? 0) === inv.totalCents && inv.totalCents === 6881, inv && { lines: inv.lines, tax: inv.taxCents, total: inv.totalCents })
})()

console.log("\nHow tax regions work, as Settings says it\n")
{
  const panel = read("components/app/settings/taxes-panel.tsx")
  check("the Taxes tab shows it under the regions", /<RegionsExplained physical=\{physical\} \/>/.test(panel) && /How tax regions work/.test(panel))
  check("  every line it says is what the code does", (() => {
    const tax = settings({ rates: [US, US_CA] })
    const stateFirst = physicalTotals(MIXED.slice(0, 1), { shippingCents: 0, tax, country: "US", region: "CA" }).taxRateBps === 725
    const digitalOff = basketTax({ enabled: true, digital: false, included: false, regions: [RO], overrides: [] }, [{ productId: "p", taxableCents: 100 }], "RO").taxCents === 0
    const countryOnly = basketTax({ enabled: true, digital: true, included: false, regions: [US_CA], overrides: [] }, [{ productId: "p", taxableCents: 1000 }], "US").taxCents === 0
    const elsewhere = physicalTotals(MIXED, { shippingCents: 0, tax, country: "FR" }).taxCents === 0
    return stateFirst && digitalOff && countryOnly && elsewhere && /state's own rate comes before its country's/.test(TAX_REGION_RULES.physical) && /only whole-country regions count/.test(TAX_REGION_RULES.digital) && /pays no tax/.test(TAX_REGION_RULES.elsewhere)
  })())
  const words = Object.values(TAX_REGION_RULES).join(" ")
  check("  in plain words: no em dash, none of the banned words", !/[—–]/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(words))
}

void invoiceDone.then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
})

/**
 * Round T: Taxes for every store. Regions, prices including tax or not,
 * a product's own rate in a region, physical totals and the single product
 * checkout charging the same tax the page shows.
 *
 *   npx tsx tests/taxes-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { physicalTotals, type TaxSettings } from "@/lib/physical/totals"
import { bpsFromPercent, checkoutTaxFor, digitalTax, percentText, rateForProduct, regionFor } from "@/lib/tax/rules"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const RO = { id: "r-ro", country: "RO", region: null, rateBps: 1900 }
const CA = { id: "r-ca", country: "US", region: "CA", rateBps: 725 }
const US = { id: "r-us", country: "US", region: null, rateBps: 0 }

console.log("\nWhich rate, and how it is written\n")
{
  check("a state's own row before its country's", regionFor([RO, US, CA], "us", "CA")?.id === "r-ca" && regionFor([RO, US, CA], "US", "NY")?.id === "r-us")
  check("a country with no region pays none: Storelib never invents a rate", regionFor([RO], "DE", null) === null && rateForProduct(null, [], "p") === 0)
  check("a product's own rate in a region wins there, and only there", rateForProduct(RO, [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }], "book") === 500 && rateForProduct(CA, [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }], "book") === 725)
  check("19% and 9.5% read and write", bpsFromPercent("19") === 1900 && bpsFromPercent("9,5") === 950 && percentText(950) === "9.5%" && percentText(1900) === "19%")
  check("  and a rate above 100% or below 0 is not one", bpsFromPercent("120") === null && bpsFromPercent("-1") === null && bpsFromPercent("x") === null)
}

console.log("\nPhysical totals with a product's own rate\n")
{
  const tax: TaxSettings = { mode: "manual", pricesIncludeTax: false, taxOnShipping: true, rates: [RO] }
  const lines = [
    { productId: "book", unitCents: 2000, quantity: 1, discountCents: 0, taxable: true },
    { productId: "mug", unitCents: 1000, quantity: 2, discountCents: 0, taxable: true },
  ]
  const plain = physicalTotals(lines, { shippingCents: 500, tax, country: "RO" })
  check("without one, exactly the sums it always made", plain.taxCents === Math.round(4000 * 0.19) + Math.round(500 * 0.19), plain)
  const own = physicalTotals(lines, { shippingCents: 500, tax: { ...tax, overrides: [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }] }, country: "RO" })
  check("the book at 5%, the mugs and the delivery at 19%", own.taxCents === 100 + 380 + 95 && own.taxRateBps === 1900 && own.totalCents === 4500 + 575, own)
  const elsewhere = physicalTotals(lines, { shippingCents: 0, tax: { ...tax, rates: [RO, { id: "r-bg", country: "BG", region: null, rateBps: 2000 }], overrides: [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }] }, country: "BG" })
  check("a rate set for Romania does nothing in Bulgaria", elsewhere.taxCents === 800, elsewhere)
  const included = physicalTotals(lines, { shippingCents: 0, tax: { ...tax, pricesIncludeTax: true, overrides: [{ taxRateId: "r-ro", productId: "book", rateBps: 500 }] }, country: "RO" })
  check("with prices including tax the total does not move", included.totalCents === 4000 && included.taxCents === Math.round(2000 - 2000 / 1.05) + Math.round(2000 - 2000 / 1.19), included)
}

console.log("\nThe single product checkout\n")
{
  const setup = { enabled: true, digital: true, included: false, regions: [RO, CA], overrides: [{ id: "o", taxRateId: "r-ro", productId: "ebook", name: "", rateBps: 500 }] }
  check("a store that does not tax digital products charges what it always did", digitalTax({ ...setup, digital: false }, { taxableCents: 1000, tipCents: 0, productId: "p", country: "RO" }).totalCents === 1000)
  const sale = digitalTax(setup, { taxableCents: 1000, tipCents: 300, productId: "p", country: "RO" })
  check("tax on the price after the code, never on the tip", sale.taxCents === 190 && sale.totalCents === 1490, sale)
  check("a product's own rate", digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "ebook", country: "RO" }).taxCents === 50)
  check("prices including tax do not move the total", digitalTax({ ...setup, included: true }, { taxableCents: 1190, tipCents: 0, productId: "p", country: "RO" }).totalCents === 1190)
  check("no country, no tax", digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "p", country: null }).taxCents === 0)

  const view = checkoutTaxFor(setup, "ebook", "ro")
  check("the page gets country rows only (a digital sale has no state) and this product's rates", !!view && view.regions.length === 1 && view.regions[0].country === "RO" && view.overrides.length === 1 && view.country === "RO", view)
  check("  nothing at all when tax is off, digital is off, or only states have rows", checkoutTaxFor({ ...setup, enabled: false }, "p", "RO") === null && checkoutTaxFor({ ...setup, digital: false }, "p", "RO") === null && checkoutTaxFor({ ...setup, regions: [CA] }, "p", "US") === null)
  check("  another product's own rate is never sent to the page", checkoutTaxFor(setup, "other", "RO")?.overrides.length === 0)
}

console.log("\nThe server charges what the page shows\n")
{
  const route = read("app/api/checkout/stripe-session/route.ts")
  check("the country is the page's, checked against the list, else the request's", /countryCode\(body\.taxCountry\) \?\? detectedCountry\(request\.headers\)/.test(route))
  check("the PaymentIntent and the wallet sheet both charge the price with tax", /amount: chargeCents,/.test(route) && /unit_amount: chargeCents,/.test(route))
  check("Storelib's fee stays on the price, never on the tax", /calculatePlatformFeeForCheckout\(totals\.totalCents,/.test(route))
  check("the tax rides on the payment for the order and the receipt", /tax_cents: String\(tax\?\.taxCents \?\? 0\)/.test(route) && /tax_included:/.test(route))
  const fulfil = read("lib/checkout/fulfil-payment.ts")
  check("the order keeps it in its own write, so an older database refuses only that", /step\("tax"/.test(fulfil) && /update\(\{ tax_cents:/.test(fulfil))
  const invoice = read("lib/checkout/invoice.ts")
  check("the receipt adds up with tax added, and says what was included", /recordedBase - recordedDiscount \+ tip \+ addedTax === total/.test(invoice) && /Including tax|includedTaxLabel/.test(invoice))
  const client = read("app/checkout/checkout-client.tsx")
  check("the page works the tax out the same way and sends the country it used", /digitalTax\(/.test(client) && /taxCountry: checkoutTax \? taxCountry : null/.test(client))
  const page = read("app/checkout/page.tsx")
  check("the page is handed the store's tax only when it taxes digital products", /checkoutTaxFor\(taxSetup, product\.id, detectedCountry\(requestHeaders\)\)/.test(page))
  const pricing = read("lib/physical/checkout-pricing-server.ts")
  check("physical checkout passes each line's product for its own rate", /productId: l\.productId, unitCents: l\.unitCents/.test(pricing))
  const config = read("lib/physical/config-server.ts")
  check("  and reads the overrides, none before part 110 is run", /loadTaxOverrides/.test(config) && /if \(error\) return \[\]/.test(config))
}

console.log("\nSettings › Taxes for every store\n")
{
  const form = read("components/app/settings-form-new.tsx")
  check("Taxes is no longer a physical-only section", !/COMMERCE_TABS = new Set<string>\(\[[^\]]*"taxes"/.test(form) && /panelTab === "taxes" && <TaxesPanel \/>/.test(form))
  const panel = read("components/app/settings/taxes-panel.tsx")
  check("tax on shipping shows only with physical products on", /\{physical \? <Toggle label="Charge tax on shipping"/.test(panel))
  check("no outline of itself while it loads", !/animate-pulse/.test(panel))
  const shipping = read("components/physical/shipping-settings.tsx")
  check("Shipping keeps no second tax card", !/function Taxes\(/.test(shipping) && !/"taxes"/.test(shipping))
  const sql = read("supabase/sql/run-now/110_taxes.sql")
  check("part 110: the digital switch is off for every store, overrides are owner read", /tax_digital boolean NOT NULL DEFAULT false/i.test(sql) && /commerce_tax_overrides/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

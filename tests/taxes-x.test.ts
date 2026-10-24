/**
 * Taxes, end to end (round X4): what each checkout records, what Settings ›
 * Taxes adds up from it, and how it says it.
 *
 *   a part refund keeps part of the tax in Tax collected; a full one none
 *   orders in another currency than the store's are said apart, never added
 *   the CSV says the tax refunded and each order's currency
 *   shipped goods orders keep their tax on the order row (they did not)
 *   a membership renewal keeps its invoice's tax on its order (it did not)
 *   a single order's invoice falls back to the row's tax
 *   the overview is in the store's selling currency, not the payout's
 *   Who does what opens in the shared Modal, in all six languages
 *   SQL part 243 copies older shipped orders' tax, the same text twice
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/taxes-x.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { keptTax, summarizeTax, taxCsv, type TaxOrderRow } from "@/lib/tax/report-model"
import { invoiceTaxFacts } from "@/lib/tax/invoice-tax"
import { basketTax, digitalTax, taxLabel } from "@/lib/tax/rules"
import { physicalTotals } from "@/lib/physical/totals"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const row = (o: Partial<TaxOrderRow>): TaxOrderRow => ({ id: "o", tax_cents: 1900, tax_country: "DE", tax_label: "VAT 19%", status: "completed", created_at: "2026-10-01T10:00:00Z", ...o })

console.log("\nRefunds in Tax collected (lib/tax/report-model keptTax)")
{
  check("a paid order keeps all its tax", keptTax(row({})) === 1900)
  check("a full refund keeps none", keptTax(row({ status: "refunded", amount_cents: 11900, refund_amount_cents: 11900 })) === 0)
  check("  nor does a refund with no amount recorded (an older row: refunded in full)", keptTax(row({ status: "refunded" })) === 0)
  check("a part refund keeps the same share of the tax as of the money (it used to drop all of it)", keptTax(row({ status: "refunded", amount_cents: 11900, refund_amount_cents: 5950 })) === 950)
  check("a failed or pending order keeps none", keptTax(row({ status: "failed" })) === 0 && keptTax(row({ status: "pending" })) === 0)
  check("partially_refunded with an amount is a share too", keptTax(row({ status: "partially_refunded", amount_cents: 10000, refund_amount_cents: 2500, tax_cents: 1000 })) === 750)
  const sum = summarizeTax([row({ id: "a" }), row({ id: "b", status: "refunded", amount_cents: 11900, refund_amount_cents: 5950 }), row({ id: "c", status: "refunded", amount_cents: 11900, refund_amount_cents: 11900 })])
  check("the summary counts the part refunded order with what it kept", sum.totalCents === 2850 && sum.orders === 2, sum)
}

console.log("\nCurrencies")
{
  const sum = summarizeTax([row({ id: "a", currency: "eur" }), row({ id: "b", currency: "usd", tax_cents: 800 }), row({ id: "c", currency: null })], "EUR")
  check("orders in the store's currency (or none recorded) are added up", sum.totalCents === 3800 && sum.orders === 2, sum)
  check("  another currency is said apart, never added in", sum.otherCurrencies?.length === 1 && sum.otherCurrencies[0].currency === "USD" && sum.otherCurrencies[0].taxCents === 800, sum.otherCurrencies)
  check("with no store currency given, every order is added (as before)", summarizeTax([row({ currency: "eur" }), row({ currency: "usd" })]).totalCents === 3800)
  const csv = taxCsv([row({ id: "a", currency: "eur" }), row({ id: "b", status: "refunded", amount_cents: 11900, refund_amount_cents: 5950, currency: "usd" })], "eur")
  const lines = csv.trim().split("\n")
  check("the CSV says the tax refunded and each order's currency", /"Tax refunded","Currency"/.test(lines[0]) && /"19\.00","0\.00","EUR"/.test(lines[1]) && /"19\.00","9\.50","USD"/.test(lines[2]), lines)
  const route = read("app/api/store/taxes/overview/route.ts")
  check("the overview is in the store's selling currency, not the payout currency", /readStoreCurrency\(db, c\.creatorId\)/.test(route) && !/payout_currency/.test(route) && /taxOverview\(c\.db, c\.creatorId, setup, days, currency\)/.test(route))
  const report = read("lib/tax/report.ts")
  check("the orders are read with their refund and currency, and an older database still answers", /amount_cents, refund_amount_cents, currency/.test(report) && /return await read\(FULL_COLUMNS\)/.test(report) && /return await read\(COLUMNS\)/.test(report))
}

console.log("\nShipped goods orders keep their tax on the order (lib/physical/checkout-server)")
{
  const src = read("lib/physical/checkout-server.ts")
  check("each line's tax goes on its order row: tax_cents, tax_country, then tax_included and tax_label", /* Round AE: a recorded follow-up step of each line. */ /if \(lineTax > 0\) await f\.idempotent\("tax", \(\) => keepLineTax\(db, fl\.orderId, \{ cents: Math\.min\(lineTax, Math\.max\(0, amounts\[i\]\)\), country: taxCountryOf\(co\), included: taxIncluded, label: taxLabel \}\)/.test(src) && /update\(\{ tax_cents: t\.cents, tax_country: t\.country \}\)/.test(src) && /update\(\{ tax_included: true \}\)/.test(src) && /update\(\{ tax_label: t\.label \}\)/.test(src))
  check("the country the tax was worked out for is kept with the checkout", /tax_country: q\.taxCountry\.toUpperCase\(\)/.test(src) && /taxCountry: \(taxPlace\.country \?\? null\)/.test(read("lib/physical/checkout-pricing-server.ts")))
  const fn = src.slice(src.indexOf("export function taxCountryOf"), src.indexOf("/** A shipped order line's tax"))
  check("  read from the checkout's tax facts, else the delivery country", /const kept = co\.shipping_rate\?\.tax_country/.test(fn) && /co\.shipping_address\?\.country/.test(fn))
  const t = physicalTotals(
    [{ productId: "p", unitCents: 10000, quantity: 1, discountCents: 0, taxable: true, digital: false }],
    { shippingCents: 500, freeShipping: false, tax: { mode: "manual", pricesIncludeTax: false, taxOnShipping: true, rates: [{ id: "r", country: "DE", region: null, rateBps: 1900, name: "VAT" } as never] }, country: "DE", region: null },
  )
  check("the shipped goods totals: tax on the items and the delivery, added on top", t.taxCents === 1995 && t.totalCents === 12495 && t.taxLabel === "VAT 19%", t)
}

console.log("\nMemberships keep their invoice's tax (lib/tax/invoice-tax, lib/memberships/sync)")
{
  const now = invoiceTaxFacts({ amount_paid: 1190, total_taxes: [{ amount: 190, tax_behavior: "exclusive", tax_rate_details: { tax_rate: "txr_1" } }] })
  check("today's invoice shape: the tax, added on top, and its rate", now?.taxCents === 190 && now.included === false && now.taxRateId === "txr_1", now)
  const older = invoiceTaxFacts({ amount_paid: 1000, total_tax_amounts: [{ amount: 160, inclusive: true, tax_rate: { id: "txr_2" } }, { amount: 0, inclusive: true, tax_rate: "txr_3" }] })
  check("the older shape: inclusive, zero lines left out", older?.taxCents === 160 && older.included === true && older.taxRateId === "txr_2", older)
  check("no tax: null", invoiceTaxFacts({ amount_paid: 1000, total_taxes: [] }) === null && invoiceTaxFacts(null) === null)
  check("never more than was paid", invoiceTaxFacts({ amount_paid: 100, total_taxes: [{ amount: 500, tax_behavior: "inclusive" }] })?.taxCents === 100)
  const sync = read("lib/memberships/sync.ts")
  check("the renewal's order gets the tax columns, each its own write", /membershipOrderTax\(invoice\)/.test(sync) && /update\(\{ tax_cents: Math\.min\(tax\.taxCents, total\), tax_country: tax\.country \}\)/.test(sync) && /update\(\{ tax_label: tax\.label\.slice\(0, 80\) \}\)/.test(sync))
  const m = read("lib/tax/membership.ts")
  check("  named from the Stripe tax rate behind it, the way every other order names it", /stripe\.taxRates\.retrieve\(facts\.taxRateId\)/.test(m) && /taxLabel\(rate\.display_name/.test(m))
  check("taxLabel names it like the checkout does", taxLabel("VAT", 1900) === "VAT 19%" && taxLabel(null, 0) === "Tax")
}

console.log("\nReceipts and invoices")
{
  const inv = read("lib/checkout/invoice.ts")
  check("a single order's invoice falls back to the order's own tax (a membership renewal has none on its payment)", /const singleFromRow = !isBasket && metaTax === 0 && rowTax\(first\) > 0/.test(inv) && /metaTax \|\| rowTax\(first\)/.test(inv))
  check("receipts read the order rows' tax (so shipped and membership orders now show it)", /select\("id, tax_cents, tax_included, tax_label"\)/.test(read("lib/receipts/load.ts")))
}

console.log("\nThe checkouts agree (lib/tax/rules)")
{
  const setup = { enabled: true, digital: true, included: false, regions: [{ id: "de", country: "DE", region: null, rateBps: 1900, name: "VAT" }], overrides: [{ taxRateId: "de", productId: "book", rateBps: 700 }] }
  const one = digitalTax(setup, { taxableCents: 1000, tipCents: 200, productId: "x", country: "DE" })
  check("single product: tax on the price after its code, never on the tip", one.taxCents === 190 && one.totalCents === 1390 && one.label === "VAT 19%")
  const basket = basketTax(setup, [{ productId: "x", taxableCents: 1000 }, { productId: "book", taxableCents: 1000 }], "de")
  check("basket: each line at its own rate, the name alone for mixed rates", basket.taxCents === 260 && basket.lineTaxCents.join() === "190,70" && basket.label === "VAT", basket)
  const inc = digitalTax({ ...setup, included: true }, { taxableCents: 1190, tipCents: 0, productId: "x", country: "DE" })
  check("prices including tax: the total does not move", inc.totalCents === 1190 && inc.taxCents === 190)
  check("a country in no region pays no tax", digitalTax(setup, { taxableCents: 1000, tipCents: 0, productId: "x", country: "FR" }).taxCents === 0)
}

console.log("\nSettings › Taxes says it in the dashboard's language")
{
  const panel = read("components/app/settings/taxes-panel.tsx")
  check("Who does what is a button that opens the shared Modal (a dialog on a computer, a sheet on a phone)", /<WhoDoesWhat open=\{explain\}/.test(panel) && /<Modal open=\{open\} onClose=\{onClose\} title=\{tt\("Who does what"\)\}>/.test(panel) && !/<details[^>]*data-tax-responsibility/.test(panel) && /aria-haspopup="dialog"/.test(panel))
  check("  it says Stripe Tax only when it is on for memberships", /membershipsAuto\s*\?/.test(panel))
  check("  and never that Storelib files or pays tax", /Storelib does not file or pay tax for you/.test(panel) && !/(we|Storelib) (file|files|remit|remits) (your|the) tax/i.test(panel))
  check("the status lines are said with tt() from their state, not the server's English", /function statusWords/.test(panel) && /case "charging":/.test(panel) && /\{words\.title\}/.test(panel))
  const keys = [...panel.matchAll(/tt\("((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string)
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    const missing = keys.filter((k) => !cat.includes(`${JSON.stringify(k)}:`))
    check(`every sentence on the panel is in ${lang}`, missing.length === 0, missing)
  }
  const copy = keys.join(" ")
  check("no AI words and no em dashes in its copy", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(copy) && !/—/.test(copy))
}

console.log("\nSQL part 243")
{
  const a = read("supabase/sql/run-now/243_shipped_order_tax_on_orders.sql")
  const b = read("supabase/migrations/20270201_x4_shipped_order_tax.sql")
  check("the run-now part and the migration are the same text", a === b)
  check("only empty tax columns on rows with a checkout change", /WHERE o\.checkout_id IS NOT NULL AND COALESCE\(o\.tax_cents, 0\) = 0/.test(a) && /tax_label IS NULL/.test(a) && !/DELETE|DROP|TRUNCATE/i.test(a.replace(/\/\*[\s\S]*?\*\//, "")))
  check("the check after running knows it", /as p243_shipped_order_tax/.test(read("supabase/sql/run-now/99_check_after.sql")) && /243_shipped_order_tax_on_orders\.sql/.test(read("supabase/sql/run-now/README.md")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

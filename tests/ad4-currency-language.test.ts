/**
 * Round AD4: currencies and languages, bug hunt. Each check here failed
 * before its fix.
 *
 *   1. The day's rates went stale over the ECB's own holidays (Christmas,
 *      Easter, May Day): a fixed four day window, measured from midnight of
 *      the rate day, is shorter than the ECB's longest closures, so market
 *      prices, marketplace dollar prices and currency changes all stopped.
 *   2. A report converted an order at the last published day before it
 *      (up to a week back), then refused that day as stale after four.
 *   3. A translated plural ("{count, plural, one {# day} other {# days}}")
 *      was kept with its argument or its cases renamed, and drawn as a bare
 *      number or nothing.
 *   4. A visitor in a market saw its prices in their language's way on the
 *      website ("39,98 €" in German) and the same amounts at checkout in
 *      English's ("€39.98").
 *
 *   npx tsx tests/ad4-currency-language.test.ts
 */
import { convertMinor, fxFresh, type FxRates } from "@/lib/markets/money"
import { inReportingCurrency } from "@/lib/money/report-currency"
import { fixedParts, keepsFixedParts } from "@/lib/markets/draft-check"
import { layeredWords, curatedLanguages, curatedWords } from "@/lib/checkout-text/words"
import { checkoutSentences, checkoutKey, emailSentences } from "@/lib/markets/checkout-words"
import { formatMessage } from "@/lib/i18n/text"
import { sourceHash, type TranslationMap } from "@/lib/markets/translate"
import { pricingFor, storefrontDisplay } from "@/lib/markets/pricing"
import { cartAmounts } from "@/lib/markets/cart-money"
import { checkoutMoneyLocale, convertOrder, marketCharge } from "@/lib/markets/checkout-charge"
import { moneyIn } from "@/app/checkout/parts/ui"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const at = (iso: string) => Date.parse(iso)
const fx = (asOf: string): FxRates => ({ asOf, rates: { USD: 1.1, RON: 5, JPY: 160 } })

console.log("\n1. The day's rates stay usable while the ECB is closed, and only then\n")
{
  /* Christmas 2026: Thursday the 24th is the last day published before Monday the 28th (afternoon). */
  check("Christmas: Thursday's rates on Monday morning", fxFresh(fx("2026-12-24"), at("2026-12-28T10:00:00Z")))
  check("  and they convert", convertMinor(1000, "EUR", "USD", fx("2026-12-24"), { now: at("2026-12-28T10:00:00Z") }) === 1100)
  /* Easter 2027: Good Friday the 26th and Easter Monday the 29th closed, Tuesday the 30th published in the afternoon. */
  check("Easter: Thursday's rates through Easter Monday and Tuesday morning", fxFresh(fx("2027-03-25"), at("2027-03-29T12:00:00Z")) && fxFresh(fx("2027-03-25"), at("2027-03-30T14:00:00Z")))
  /* Christmas 2028 falls on Monday and Tuesday: Friday the 22nd until Wednesday the 27th. */
  check("Christmas on a Monday: Friday's rates until Wednesday afternoon", fxFresh(fx("2028-12-22"), at("2028-12-27T14:00:00Z")))
  /* May Day 2026 is a Friday: Thursday the 30th to Monday the 4th. */
  check("May Day on a Friday: Thursday's rates on Monday", fxFresh(fx("2026-04-30"), at("2026-05-04T12:00:00Z")))
  check("an ordinary weekend: Friday's rates on Monday", fxFresh(fx("2026-10-23"), at("2026-10-26T12:00:00Z")))
  check("still stale when the ECB published and the rates were not fetched for days", !fxFresh(fx("2026-10-09"), at("2026-10-20T00:00:00Z")) && !fxFresh(fx("2026-10-19"), at("2026-10-22T18:00:00Z")))
  check("  one missed publication (a late run) is not stale yet", fxFresh(fx("2026-10-19"), at("2026-10-20T18:00:00Z")))
  check("  rates from the future are not used", !fxFresh(fx("2026-10-25"), at("2026-10-22T12:00:00Z")))
  check("  nor a malformed day", !fxFresh({ asOf: "yesterday", rates: { USD: 1 } }, at("2026-10-22T12:00:00Z")))
}

console.log("\n2. A report converts an order at the day standing in for it\n")
{
  const days = [{ asOf: "2027-03-25", rates: { USD: 1.1, RON: 5 } }]
  /* An order on Easter Monday 2027: the last published day is Thursday, within the week a report looks back. */
  const out = inReportingCurrency([{ created_at: "2027-03-29T20:00:00Z", currency: "usd", amount_cents: 1100 }], "RON", days)
  check("an Easter Monday order is converted at Thursday's rate", out.converted === 1 && out.unconverted === 0 && out.rows[0].amount_cents === 5000, out)
  const late = inReportingCurrency([{ created_at: "2027-04-03T12:00:00Z", currency: "usd", amount_cents: 1100 }], "RON", days)
  check("  and still nothing beyond the week back", late.converted === 0 && late.unconverted === 1, late)
}

console.log("\n3. A translation keeps its plural's argument and cases\n")
{
  const src = "Within {count, plural, one {# day} other {# days}} of delivery"
  check("a correct translation passes, with the language's own cases", keepsFixedParts(src, "În {count, plural, one {# zi} few {# zile} other {# de zile}} de la livrare"))
  check("  a renamed argument is refused", !keepsFixedParts(src, "Dans {compte, plural, one {# jour} other {# jours}} après la livraison"), [...fixedParts(src)])
  check("  a translated keyword is refused", !keepsFixedParts(src, "Dans {count, pluriel, un {# jour} autre {# jours}} après la livraison"))
  check("  cases that are not plural categories are refused", !keepsFixedParts(src, "Dans {count, plural, un {# jour} autre {# jours}} après la livraison"))
  check("  a plural with no other case is refused", !keepsFixedParts(src, "Dans {count, plural, one {# jour}} après la livraison"))
  check("  the plural turned into a bare slot is refused", !keepsFixedParts(src, "Dans {count} jours après la livraison"))
  const sel = "{kind, select, physical {Shipped} other {Ready}}"
  check("a select keeps its case values", keepsFixedParts(sel, "{kind, select, physical {Expédié} other {Prêt}}") && !keepsFixedParts(sel, "{kind, select, physique {Expédié} other {Prêt}}"))
  check("  and a placeholder inside a case still counts", !keepsFixedParts("{n, plural, one {# for {name}} other {# for {name}}}", "{n, plural, one {# pour} other {# pour}}"))
  const broken = "Dans {count, pluriel, un {# jour} autre {# jours}} après la livraison"
  check("  (what such a translation drew: the number alone)", formatMessage(broken, { count: 14 }, "fr") === "Dans 14 après la livraison")

  /* One already saved before this check: the checkout draws the English rather than a sentence with its count missing. */
  const key = checkoutKey(src)
  const map: TranslationMap = new Map([[key, { key, value: broken, status: "approved", source: "ai", sourceHash: sourceHash(src) } as never]])
  const words = layeredWords({ sentences: [src], language: "xx", rows: map, keyOf: checkoutKey })
  check("a saved machine translation that broke its plural is not drawn", words[src] === undefined, words)

  /* Storelib's own curated words keep every sentence's placeholders and plurals. */
  const all = new Set([...checkoutSentences(), ...emailSentences()])
  const bad: string[] = []
  for (const lang of curatedLanguages()) for (const [s, v] of Object.entries(curatedWords(lang))) if (all.has(s) && !keepsFixedParts(s, v)) bad.push(`${lang}: ${s} => ${v}`)
  check("every curated checkout and email sentence keeps its placeholders and plurals", bad.length === 0, bad.slice(0, 5))
}

console.log("\n4. The checkout writes a market's amounts as the website did\n")
{
  const now = Date.now()
  const asOf = new Date(now).toISOString().slice(0, 10)
  const pricing = pricingFor({ id: "de", name: "Germany", currency: "EUR", rounding: "nine_nine", adjustBps: 0 }, "RON", { asOf, rates: { RON: 5 } }, now)!
  const display = storefrontDisplay(pricing, "de", "EUR")
  const lines = [{ priceCents: 9995, quantity: 2 }]
  const cart = cartAmounts(lines, display, "RON")
  const charge = marketCharge(pricing)
  const order = convertOrder(lines.map((l) => ({ unitCents: l.priceCents, quantity: l.quantity, discountCents: 0 })), { itemsSubtotalCents: 19990, discountCents: 0, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: 19990 }, charge)
  const atCheckout = moneyIn(order.totals.totalCents, "EUR", checkoutMoneyLocale(charge, "de"))
  check("the cart's total and the checkout's are written the same way", cart.total === atCheckout, { cart: cart.total, checkout: atCheckout })
  check("  the store's own prices stay as every page writes them", checkoutMoneyLocale(null, "de") === "en-US" && moneyIn(4800, "RON", checkoutMoneyLocale(null, "de")) === "48.00\u00a0lei")
  check("  the website's checkout is told the language when it charges a market", /<CheckoutCurrency currency=\{market\.chargeCurrency\} locale=\{checkoutMoneyLocale\(market\.charge, language\.lang\)\}>/.test(read("app/checkout/site/page.tsx")))
  check("  and a tip's whole amount drops its decimals either way", /money\(cents\)\.replace\(\/\[\.,\]00/.test(read("app/checkout/parts/order-summary.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

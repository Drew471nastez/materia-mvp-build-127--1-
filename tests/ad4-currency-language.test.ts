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
 *   5. A store that converted its currency kept its website's free shipping
 *      banner amount as the old number: "free shipping over 50" in euros
 *      became 50 lei while the rates said 248.50 lei. And the setting was
 *      labelled in dollars whatever the store sells in.
 *   6. A buyer's email in Arabic or Hebrew was laid out left to right: the
 *      website turns right to left for those languages, the emails did not.
 *   7. A market whose currency the checkout cannot charge ("Shown only, paid
 *      in RON") still showed its prices with the market's adjustment: a
 *      -30% market read 30% below what the card was then charged.
 *   8. A customer's account on a website in French listed their orders with
 *      English dates ("Oct 3, 2026"), states ("Delivered") and buttons
 *      ("Track order"), whatever the page's language.
 *   9. The website's currency selector said "Prices in PLN are for
 *      reference. You'll pay in RON; your bank converts it." in English on
 *      every language of the website; the checkout already said it in the
 *      buyer's.
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
import { pricingFor, storeCentsFromShown, storefrontDisplay } from "@/lib/markets/pricing"
import { cartAmounts } from "@/lib/markets/cart-money"
import { checkoutMoneyLocale, convertOrder, marketCharge } from "@/lib/markets/checkout-charge"
import { moneyIn } from "@/app/checkout/parts/ui"
import { themeSettingsForNewBase } from "@/lib/markets/base-change"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { inEmailLanguage } from "@/lib/emails/words"
import { orderConfirmationEmail, type OrderEmailModel } from "@/lib/physical/email-templates"
import { customerInLanguage, ACCOUNT_WORDS } from "@/lib/site-accounts/account-language"
import { UI_WORDS } from "@/lib/markets/ui-words"
import { chargeNoteIn } from "@/lib/markets/checkout-words"
import { languageChoiceOf } from "@/lib/markets/choice"
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

console.log("\n5. The website's free shipping amount moves with the store's currency\n")
{
  const settings = { free_shipping_bar: true, free_shipping_threshold: 50, primary_color: "#111111" }
  const converted = themeSettingsForNewBase(settings, { from: "EUR", to: "RON", mode: "convert", rate: 4.97 })
  check("converted at the change's rate, the rest untouched", converted !== null && converted.free_shipping_threshold === 248.5 && converted.primary_color === "#111111" && converted.free_shipping_bar === true, converted)
  check("  kept amounts keep the number", themeSettingsForNewBase(settings, { from: "EUR", to: "RON", mode: "keep", rate: null }) === null)
  check("  nothing to move without an amount", themeSettingsForNewBase({ free_shipping_threshold: 0 }, { from: "EUR", to: "RON", mode: "convert", rate: 4.97 }) === null && themeSettingsForNewBase(null, { from: "EUR", to: "RON", mode: "convert", rate: 4.97 }) === null)
  check("  a text amount is read too", themeSettingsForNewBase({ free_shipping_threshold: "20" }, { from: "EUR", to: "RON", mode: "convert", rate: 5 })?.free_shipping_threshold === 100)
  const undo = themeSettingsForNewBase(converted, { from: "RON", to: "EUR", mode: "convert", rate: 1 / 4.97 })
  check("  and undo puts the amount back", undo?.free_shipping_threshold === 50, undo)
  const route = read("app/api/store/currency/route.ts")
  check("the change and its undo move the website's settings, draft and published", /moveThemeSettings\(c\.db, c\.creatorId, \{ from: store\.currency, to, mode, rate \}\)/.test(route) && /moveThemeSettings\(c\.db, c\.creatorId, \{ from: latest\.to, to: latest\.from/.test(route) && /draft_settings/.test(route))
  const field = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? []).find((f) => (f as { id?: string }).id === "free_shipping_threshold") as { label?: string; unit?: string } | undefined
  check("the setting is not labelled in dollars", !!field && !/\$/.test(field.label ?? "") && field.unit !== "$", field)
}

console.log("\n6. A buyer's email reads right to left in a language written that way\n")
{
  const model: OrderEmailModel = {
    shopName: "Bread Studio", orderNumber: "#1042", buyerFirstName: "Ana",
    lines: [{ title: "Mug", variantName: null, quantity: 2, cents: 4000, imageUrl: null }],
    totals: { subtotal: 4000, discount: 0, shipping: 500, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 4500, currency: "EUR" },
    address: { line1: "1 Rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" }, deliveryName: "Standard", deliveryEstimate: null,
    statusUrl: "https://bread.studio/orders/x", hasDownloads: false,
  }
  const ar = inEmailLanguage("ar", {}, () => orderConfirmationEmail(model)).html
  const he = inEmailLanguage("he", {}, () => orderConfirmationEmail(model)).html
  const en = inEmailLanguage("en", {}, () => orderConfirmationEmail(model)).html
  check("an Arabic email says it is right to left", /<html lang="ar" dir="rtl"/.test(ar) && /lang="ar" dir="rtl" class="e-bg"/.test(ar), ar.slice(0, 200))
  check("  and so does a Hebrew one", /<html lang="he" dir="rtl"/.test(he))
  check("  its amounts sit at the line's end, which is the left", !/align="right"/.test(ar) && !/text-align:right/.test(ar) && /align="left"/.test(ar))
  check("an English email is unchanged: no direction, amounts on the right", !/dir="rtl"/.test(en) && /align="right"/.test(en) && !/<html lang="en" dir=/.test(en))
}

console.log("\n7. A market shown only, never charged, shows what the card will pay\n")
{
  const now = Date.now()
  const asOf = new Date(now).toISOString().slice(0, 10)
  const fxDay = { asOf, rates: { RON: 5, PLN: 4.3 } }
  const pln = pricingFor({ id: "pl", name: "Poland", currency: "PLN", rounding: "none", adjustBps: -3000 }, "RON", fxDay, now)!
  const plain = pricingFor({ id: "pl", name: "Poland", currency: "PLN", rounding: "none", adjustBps: 0 }, "RON", fxDay, now)!
  check("a PLN market (charged in lei) shows the plain conversion, without its -30%", pln.convert(10000) === plain.convert(10000) && pln.convert(10000) === 8600, { adjusted: pln.convert(10000), plain: plain.convert(10000) })
  const eur = pricingFor({ id: "de", name: "Germany", currency: "EUR", rounding: "none", adjustBps: -3000 }, "RON", fxDay, now)!
  check("  a market the checkout charges in keeps its adjustment, charged as shown", eur.convert(10000) === 1400 && marketCharge(eur).price(10000) === 1400)
  check("  the cart reads back a shown price the same way", storeCentsFromShown(8600, storefrontDisplay(pln, "pl", "RON")) === 10000)
  const panel = read("components/app/settings/markets-panel.tsx")
  check("the settings offer the adjustment only where it is charged", /chargeableCurrency\(m\.currency\) \? \(\s*<Field label=\{tt\("Adjustment \(%\)"\)\}/.test(panel), panel.match(/[^\n]*Adjustment \(%\)[^\n]*/)?.[0])
}

console.log("\n8. A customer's orders read in the website's language\n")
{
  const customer = {
    name: "Ana", email: "ana@example.com",
    orders: [
      { id: "o1", number: "AB12", date: "Oct 3, 2026", created_at: "2026-10-03T22:30:00Z", status: "Delivered", state: "open", total: "Free", price: "Free", action_label: "Track order", items: [{ title: "No longer available", image: "", url: "", variant: "" }, { title: "Mug", image: "", url: "", variant: "" }], tracking: [{ company: "DHL", number: "1", url: "", status: "In transit" }] },
    ],
  }
  const fr = { order_delivered: "Livrée", order_track: "Suivre la commande", order_free: "Gratuit", order_unavailable: "Plus disponible", order_in_transit: "En transit" }
  const out = customerInLanguage(customer, "fr", fr) as typeof customer
  const o = out.orders[0]
  check("the date in French", o.date === "3 oct. 2026", o.date)
  check("  the state, the button, the free total and the gone product in the shop's French words", o.status === "Livrée" && o.action_label === "Suivre la commande" && o.total === "Gratuit" && o.price === "Gratuit" && o.items[0].title === "Plus disponible" && o.items[1].title === "Mug" && o.tracking[0].status === "En transit", o)
  check("  a word with no translation stays English, never blank", (customerInLanguage({ orders: [{ ...customer.orders[0], status: "Shipped" }] }, "fr", fr) as typeof customer).orders[0].status === "Shipped")
  check("  the customer it was given is not changed", customer.orders[0].status === "Delivered" && customer.orders[0].date === "Oct 3, 2026")
  check("in English it is exactly what it was", JSON.stringify(customerInLanguage(customer, "en", {})) === JSON.stringify(customer))
  check("every state and button the account writes is a shop word", Object.values(ACCOUNT_WORDS).every((k) => k in UI_WORDS) && ["Processing", "Refunded", "On hold", "Partly refunded", "Complete", "Delivered", "Shipped", "Confirmed", "Cancelled", "Partly ready", "Partly shipped", "Ready for pickup", "Picked up", "In transit", "Out for delivery", "Delivery problem", "Sent to be shipped", "Being prepared", "Track order", "View order", "Download", "Access", "Free", "No longer available"].every((w) => w in ACCOUNT_WORDS))
  check("the account page draws its customer in the page's language", /customerInLanguage\(extras\.customer, localizer\.locale, localizer\.words\)/.test(read("app/(site)/w/[username]/render-account.tsx")))
}

console.log("\n9. The currency selector's note in the page's language\n")
{
  check("in French, with Storelib's own words for it", chargeNoteIn("fr", null, "PLN", "RON") === "Les prix en PLN sont donnés à titre indicatif. Vous paierez en RON ; votre banque fait la conversion.", chargeNoteIn("fr", null, "PLN", "RON"))
  check("  in English as it was, and nothing when the two are the same", chargeNoteIn("en", null, "PLN", "RON") === "Prices in PLN are for reference. You'll pay in RON; your bank converts it." && chargeNoteIn("fr", null, "RON", "RON") === null)
  const now = Date.now()
  const asOf = new Date(now).toISOString().slice(0, 10)
  const pln = pricingFor({ id: "pl", name: "Poland", currency: "PLN", rounding: "none", adjustBps: 0 }, "RON", { asOf, rates: { RON: 5, PLN: 4.3 } }, now)!
  const choice = languageChoiceOf({ defaultLanguage: "en", others: ["fr"], locale: "fr", markets: [{ id: "pl", name: "Poland", currency: "PLN", countries: ["PL"] }], fresh: true, pricing: pln, base: "RON", charge: "RON", say: (d, c) => chargeNoteIn("fr", null, d, c) })
  check("the selector on a French page says it in French", choice.currency?.note === chargeNoteIn("fr", null, "PLN", "RON"), choice.currency)
  check("  and the live website hands it the page's words", /say: \(shown, paid\) => chargeNoteIn\(lang, map, shown, paid\)/.test(read("lib/markets/live.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

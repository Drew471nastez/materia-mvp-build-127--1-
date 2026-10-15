/**
 * A store's prices are in the currency checkout charges them in
 * (lib/store/shop-money.ts), lei on a deployment that has not said dollars.
 * This suite runs as one: what a website writes, what search engines are
 * told, what a market converts from, and that a price printed in a market's
 * currency goes into the cart in the store's, never converted twice.
 */
import "./_ron"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SHOP_CURRENCY, shopAmount, shopMoney } from "@/lib/store/shop-money"
import { formatPrice } from "@/lib/website-builder/shop-products"
import { convertCardPrices, pricingFor, storeCentsFromShown, type MarketPrice, type StorefrontDisplay } from "@/lib/markets/pricing"
import { priceCentsFrom } from "@/lib/website-builder/storefront-hooks"
import { validateLocalization } from "@/lib/markets/model"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA lei deployment")
check("the store's currency is lei", SHOP_CURRENCY === "RON", SHOP_CURRENCY)
check("a card writes lei, never a dollar sign over them", formatPrice(4800) === shopMoney(4800) && /* Changed on purpose (checkout, currency and translation overhaul): lei is written as lei (lib/markets/money formatCurrency). */ /lei/.test(formatPrice(4800)) && !/\$/.test(formatPrice(4800)), formatPrice(4800))
check("a large price is grouped on the product page", /1,250\.00/.test(shopMoney(125000, { grouping: true })))
check("a filter's amount is whole", shopAmount(10) === shopMoney(1000).replace(".00", ""), [shopAmount(10), shopMoney(1000)])
check("an unreadable amount is zero, never NaN", !/NaN/.test(shopMoney(Number.NaN)))
check("the price read back from what a card wrote", priceCentsFrom(formatPrice(4800)) === 4800)

console.log("\nEverything that names the store's currency names this one")
for (const [file, pattern] of [
  ["lib/website-builder/site-seo.ts", /priceCurrency: p\.currency \?\? SHOP_CURRENCY/],
  ["lib/storelib-theme/render.ts", /SHOP_CURRENCY_CODE = SHOP_CURRENCY/],
  ["lib/products/product-page-model.ts", /PRODUCT_CURRENCY_CODE = SHOP_CURRENCY/],
  ["app/api/store/markets/route.ts", /readStoreCurrency\(c\.db, c\.creatorId\)\)\.currency/],
  /* Changed on purpose: the store's own currency (Settings › Country & Currency). */
  ["app/app/products/load-editor.ts", /currency: store\.currency,/],
  ["lib/website-builder/compat-site.ts", /currency, moneyFormat: moneyFormatFor\(currency\)/],
] as const) check(`  ${file}`, pattern.test(read(file)))
check("no market converts from the payout currency any more", !/payout_currency/.test(read("app/api/store/markets/route.ts")) && !/payout_currency/.test(read("app/api/store/translations/route.ts")))

console.log("\nA price printed in a market's currency goes into the cart in the store's")
const fx = { asOf: new Date().toISOString().slice(0, 10), rates: { RON: 5, USD: 1.1 } }
const eur: MarketPrice = { id: "m1", name: "Europe", currency: "EUR", rounding: "none" as MarketPrice["rounding"], adjustBps: 0 }
const display: StorefrontDisplay = { market: eur, base: "RON", fx, locale: "en", note: null }
const pricing = pricingFor(eur, "RON", fx)!
const shown = pricing.convert(5000)!
check("50 lei shows as 10 euro", shown === 1000, shown)
check("10 euro on the button is 50 lei in the cart", storeCentsFromShown(1000, display) === 5000, storeCentsFromShown(1000, display))
const marked: StorefrontDisplay = { ...display, market: { ...eur, adjustBps: 1000 } }
const up = pricingFor(marked.market, "RON", fx)!.convert(5000)!
check("a market priced 10% up: the adjustment comes off again", storeCentsFromShown(up, marked) === 5000, [up, storeCentsFromShown(up, marked)])
check("a page in the store's own currency is left alone", storeCentsFromShown(5000, null) === null)
check("stale rates convert nothing back either", storeCentsFromShown(1000, { ...display, fx: { asOf: "2020-01-01", rates: fx.rates } }) === null)
check("the add to cart button uses it", /storeCentsFromShown\(line\.priceCents, display\)/.test(read("components/website-builder/sections/site-chrome-hooks.tsx")))

console.log("\nThe builder previews a market's prices as the website shows them")
const card = { id: "p", settings: { price: formatPrice(5000), compare_price: "", currency: "RON", variants: [{ price: formatPrice(5000), compare_price: "" }] } }
const [eu] = convertCardPrices([card], pricing, "en")
check("a card's price, its options' and its currency, converted", /10/.test(eu.settings.price) && eu.settings.currency === "EUR" && eu.settings.variants![0].price === eu.settings.price, eu.settings)
check("  no market: the card as it was", convertCardPrices([card], null)[0] === card)
check("the live site and the builder use the one function", /pricesInMarket\(worded\.settings, pricing, moneyLocale\)/.test(read("lib/markets/live.ts")) && /* Changed on purpose (merge with main): the canvas converts with pricesInMarket, which convertCardPrices is the list form of. */ (read("app/website-builder/editor/[installId]/page.tsx").match(/cardsInMarket\(localizeCards\(/g) ?? []).length === 2)
check("  the cart and the product page in the canvas take the same conversion", /* And the store's currency. */ /* Changed on purpose (merge with main): and the theme's switch, as a preview. */ /storefront = useMemo\(\(\) => \(\{ inEditor: true, installId, words, display, currency, language, preview: languagePreview \}\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /* Changed on purpose (Storelib Reviews: the product's stars ride along, so the market is added only when there is one). */ /const display = (previewPricing \? )?\{ market: previewPricing\.market, base: previewPricing\.base/.test(read("app/website-builder/editor/[installId]/page.tsx")))
check("  the switch offers the markets the day's rates can convert to", /* Changed on purpose (merge with main): the market preview is its own hook. */ /info\.markets\.filter\(\(m\) => m\.countries\.length > 0 && pricingFor\(m, info\.base, info\.fx\) !== null\)/.test(read("components/website-builder/use-preview-market.ts")))

console.log("\nA market's own exchange rate")
const own: MarketPrice = { ...eur, rate: 0.25 }
const ownPricing = pricingFor(own, "RON", null)
check("converts with the store's rate, even with no day's rates at all", !!ownPricing && ownPricing.convert(4000) === 1000, ownPricing?.convert(4000))
check("  and never goes stale", !!pricingFor(own, "RON", { asOf: "2020-01-01", rates: { RON: 5 } }))
check("  the euro either way round", pricingFor({ ...own, currency: "RON", rate: 4 }, "EUR", null)?.convert(100) === 400 && pricingFor({ ...own, rate: 2 }, "USD", null)?.convert(100) === 200)
check("  the cart puts back the store's price from it", storeCentsFromShown(1000, { market: own, base: "RON", fx: ownPricing!.fx, locale: "en", note: null }) === 4000)
const saved = validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "Home", primary: true, rate: 3 }, { id: "eu", name: "Europe", countries: ["DE"], currency: "EUR", rate: "0.2" }] }, { baseCurrency: "RON" })
check("saved with the market, never on the home market", saved.ok && saved.value.markets[1].rate === 0.2 && saved.value.markets[0].rate === undefined, saved)
check("  a rate that is not a number above 0 is refused", !validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "Home", primary: true }, { id: "eu", name: "Europe", countries: ["DE"], currency: "EUR", rate: -1 }] }, { baseCurrency: "RON" }).ok)
check("the visitor is offered a market that converts by its own rate", /const offered = langs\.markets\.filter\(\(m\) => m\.countries\.length && pricingFor\(m, charge, rates\)\)/.test(read("lib/markets/live.ts")) && /rate: m\.rate/.test(read("lib/markets/live.ts")))
check("set in the market's own settings", /data-market-rate=""/.test(read("components/app/settings/markets-panel.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

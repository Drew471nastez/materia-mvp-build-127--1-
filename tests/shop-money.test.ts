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

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA lei deployment")
check("the store's currency is lei", SHOP_CURRENCY === "RON", SHOP_CURRENCY)
check("a card writes lei, never a dollar sign over them", formatPrice(4800) === shopMoney(4800) && /RON/.test(formatPrice(4800)) && !/\$/.test(formatPrice(4800)), formatPrice(4800))
check("a large price is grouped on the product page", /1,250\.00/.test(shopMoney(125000, { grouping: true })))
check("a filter's amount is whole", shopAmount(10) === shopMoney(1000).replace(".00", ""), [shopAmount(10), shopMoney(1000)])
check("an unreadable amount is zero, never NaN", !/NaN/.test(shopMoney(Number.NaN)))
check("the price read back from what a card wrote", priceCentsFrom(formatPrice(4800)) === 4800)

console.log("\nEverything that names the store's currency names this one")
for (const [file, pattern] of [
  ["lib/website-builder/site-seo.ts", /priceCurrency: SHOP_CURRENCY/],
  ["lib/storelib-theme/render.ts", /SHOP_CURRENCY_CODE = SHOP_CURRENCY/],
  ["lib/products/product-page-model.ts", /PRODUCT_CURRENCY_CODE = SHOP_CURRENCY/],
  ["app/api/store/markets/route.ts", /SHOP_CURRENCY/],
  ["app/app/products/load-editor.ts", /currency: SHOP_CURRENCY,/],
  ["lib/website-builder/compat-site.ts", /currency: SHOP_CURRENCY, moneyFormat: moneyFormatFor\(SHOP_CURRENCY\)/],
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
check("the live site and the builder use the one function", /convertCardPrices\(\[worded\], pricing, moneyLocale\)/.test(read("lib/markets/live.ts")) && (read("app/website-builder/editor/[installId]/page.tsx").match(/convertCardPrices\(localizeCards\(/g) ?? []).length === 2)
check("  the cart and the product page in the canvas take the same conversion", /storefront = useMemo\(\(\) => \(\{ inEditor: true, installId, words, display \}\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /display: \{ market: previewDisplay\.market/.test(read("app/website-builder/editor/[installId]/page.tsx")))
check("  the switch offers the markets the day's rates can convert to", /data\.markets\.filter\(\(m\) => pricingFor\(m, data\.base, data\.fx\)\)/.test(read("components/website-builder/use-preview-language.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

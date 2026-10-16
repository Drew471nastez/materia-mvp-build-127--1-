/**
 * The builder's canvas in a market's currency, and the theme's own language
 * and currency selectors there (the owner: currency in the builder like the
 * live site). The canvas converts with the live site's own functions
 * (lib/markets/pricing, compat-prices, choice), so a price in the builder
 * and on the website are the same string; a choice in a theme's selector
 * changes the preview; nothing is saved or charged.
 *
 *   node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pricingFor, pricesInMarket, storefrontDisplay, type MarketPrice } from "@/lib/markets/pricing"
import { formatMinor, type FxRates } from "@/lib/markets/money"
import { languageChoiceOf } from "@/lib/markets/choice"
import { commerceInMarket, compatPrices, compatShop, countryList, themeCountries } from "@/lib/markets/compat-prices"
import { commerceMarkup } from "@/lib/storelib-theme/compat/site-commerce-markup"
import { freeShippingLine } from "@/lib/website-builder/site-commerce"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"
import { DISPLAY_CURRENCY_KEY, themeGlobals } from "@/lib/storelib-theme/resolve"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const today = new Date().toISOString().slice(0, 10)
const fx: FxRates = { asOf: today, rates: { USD: 1.1, RON: 5.0, JPY: 160 } }
const stale: FxRates = { asOf: "2020-01-02", rates: fx.rates }
const ron: MarketPrice & { countries: string[] } = { id: "ro", name: "Romania", currency: "RON", rounding: "whole", adjustBps: 0, countries: ["RO"] }
const eur: MarketPrice & { countries: string[] } = { id: "eu", name: "Europe", currency: "EUR", rounding: "none", adjustBps: 0, countries: ["DE", "FR"] }
const nowhere: MarketPrice & { countries: string[] } = { id: "x", name: "Empty", currency: "JPY", rounding: "none", adjustBps: 0, countries: [] }

console.log("\nPrices in the market previewed, as the website writes them\n")
{
  const p = pricingFor(ron, "USD", fx)!
  check("the live site's conversion: $48.00 in Romania, rounded up to whole lei and written whole", p.format(4800, "en") === formatMinor(21900, "RON", "en", { wholeAsWhole: true }), p.format(4800, "en"))
  const card = { price: "$48.00", compare_price: "$60.00", currency: "USD", variants: [{ price: "$48.00", compare_price: "" }, { price: "$52.00" }] }
  const out = pricesInMarket(card, p, "en")
  check("a card's price, its old price and each variant's, in the market's currency", out.price === p.format(4800, "en") && out.compare_price === p.format(6000, "en") && out.variants![1].price === p.format(5200, "en") && out.currency === "RON", out)
  check("  an empty old price stays empty, and the card handed in is not changed", out.variants![0].compare_price === "" && card.price === "$48.00")
  const fr = pricingFor(eur, "USD", fx)!
  check("  written the page's language's way: the canvas previewing French writes euros as /fr does", pricesInMarket({ price: "$11.00" }, fr, "fr").price === fr.format(1100, "fr") && /€/.test(fr.format(1100, "fr")!))
  check("  a membership keeps its /month", /\/month$/.test(pricesInMarket({ price: "$9.00/month" }, fr, "en").price!))
  const d = storefrontDisplay(p, "en", "USD")
  check("the cart's conversion is the same data the live site hands the page, and gives the same amounts", d.market.id === "ro" && d.base === "USD" && d.locale === "en" && pricingFor(d.market, d.base, d.fx)!.format(4800, d.locale) === p.format(4800, "en"))
  check("  and says the card is charged in the store's currency", typeof d.note === "string" && /USD/.test(d.note))
  check("rates older than four days convert nothing: the store's own prices", pricingFor(ron, "USD", stale) === null)
}

console.log("\nThe free shipping banner counts in the currency the cart is in\n")
{
  /* Changed on purpose (merge): the store's own currency, named by its code; the platform's when none is given (lib/store/selling-currency). */
  check("the store's own currency by default", freeShippingLine(2500, 7500, "USD")?.text === "Spend $50.00 more for free shipping" && freeShippingLine(2500, 7500)?.text === `Spend ${shopMoneyIn(5000, SHOP_CURRENCY)} more for free shipping`)
  const p = pricingFor(eur, "USD", fx)!
  const money = (c: number) => p.format(c, "en") ?? ""
  check("  the market's currency where the page shows one (useMoney)", freeShippingLine(2500, 7500, money)?.text === `Spend ${p.format(5000, "en")} more for free shipping`)
  const c = commerceInMarket({ freeShippingFromCents: 7500, returnsLine: null }, pricingFor(ron, "USD", fx), "en")!
  check("an imported theme's banner: the threshold converted as a price is ($75 is 341 lei, rounded up), the amount written in lei", c.freeShippingFromCents === 34100 && c.money?.currency === "RON" && c.money.whole === true, c)
  const html = commerceMarkup(c, 0).bodyStart
  check("  drawn with the market's money, never a dollar sign", html.includes(formatMinor(34100, "RON", "en", { wholeAsWhole: true })) && !/\$/.test(html), html)
  check("  and its script writes it the same way after a change to the cart", /Intl\.NumberFormat\("en",\{style:"currency",currency:"RON"/.test(commerceMarkup(c, 0).bodyEnd))
  check("  the store's prices: nothing changes", commerceInMarket({ freeShippingFromCents: 7500, returnsLine: null }, null, "en")?.freeShippingFromCents === 7500)
}

console.log("\nAn imported theme in the market previewed\n")
{
  const p = pricingFor(eur, "USD", fx)!
  const s = compatPrices({ price: "48.00", compare_price: "", variants: [{ price: "48.00" }] }, p)
  check("prices in the decimal the theme's money filter reads, each variant's too", s.price === (Math.round((4800 / 1.1)) / 100).toFixed(2) && (s.variants as { price: string }[])[0].price === s.price && s.currency === "EUR", s)
  const shop = compatShop({ name: "Mugs", currency: "USD", moneyFormat: "${{amount}}" }, p, "fr")
  check("  the shop's currency and money format follow the market, in the page's language", shop.currency === "EUR" && /* Changed on purpose (the owner: "5.02 R$" in Romanian; French writes its decimal comma) */ shop.moneyFormat === "{{amount_with_comma_separator}} €" && compatShop({ currency: "USD" }, null, "fr").currency === "USD", shop)
  const where = themeCountries({ markets: [ron, eur], base: "USD", marketId: "eu", visitorCountry: null, homeCountry: "US", fresh: true })
  check("the theme's country selector lists every country with the currency it sees", where.countries.length === countryList([], "USD").length && where.countries.find((c) => c.code === "RO")?.currency === "RON" && where.countries.find((c) => c.code === "US")?.currency === "USD")
  check("  the market previewed picks its first country", where.country?.code === "FR" || where.country?.code === "DE")
  check("  a country chosen in the theme is the one shown", themeCountries({ markets: [ron, eur], base: "USD", marketId: "eu", visitorCountry: "de", homeCountry: "US", fresh: true }).country?.code === "DE")
  check("  the store's prices: its home country", themeCountries({ markets: [ron, eur], base: "USD", marketId: null, visitorCountry: null, homeCountry: "US", fresh: true }).country?.code === "US")
  check("  without fresh rates every country sees the store's currency", themeCountries({ markets: [ron], base: "USD", marketId: null, visitorCountry: null, homeCountry: "US", fresh: false }).countries.every((c) => c.currency === "USD"))
}

console.log("\nThe built-in theme's language and currency switch\n")
{
  const p = pricingFor(ron, "USD", fx)
  const choice = languageChoiceOf({ defaultLanguage: "en", others: ["fr"], locale: "fr", markets: [ron, eur, nowhere], fresh: true, pricing: p, base: "USD", charge: "USD" })
  check("every published language, the website's own first", choice.code === "fr" && choice.languages.map((l) => l.code).join() === "en,fr")
  check("the store's currency and each market a visitor can be in", choice.currency?.options.map((o) => o.id).join() === "home,ro,eu" && choice.currency?.current === "ro")
  check("  a converted currency is never offered as the one the card is charged in", typeof choice.currency?.note === "string" && /* Changed on purpose (overhaul): the note's words. */ /You'll pay in USD/.test(choice.currency!.note!))
  check("  no currency choice without fresh rates", languageChoiceOf({ defaultLanguage: "en", others: [], locale: null, markets: [ron], fresh: false, pricing: null, base: "USD", charge: "USD" }).currency === undefined)
}

console.log("\nA custom section's currency\n")
{
  check("theme.currency.code is the store's, or the market's the page shows", (themeGlobals({}).currency as { code: string }).code === "USD" && (themeGlobals({ [DISPLAY_CURRENCY_KEY]: "RON" }).currency as { code: string }).code === "RON")
  check("  anything else is not a currency", (themeGlobals({ [DISPLAY_CURRENCY_KEY]: "<b>" }).currency as { code: string }).code === "USD")
  check("  the live site puts it on the page in a market", /\[DISPLAY_CURRENCY_KEY\]: pricing\.currency/.test(read("lib/markets/live.ts")))
}

console.log("\nOne set of functions for the website and the canvas\n")
{
  const live = read("lib/markets/live.ts")
  const compat = read("lib/markets/compat.ts")
  check("the live site's cards, cart and switch use the shared functions", /* Changed on purpose (overhaul): the card's words first, then its prices; charged in the market's currency when the checkout can. */ /pricesInMarket\(worded\.settings, pricing, moneyLocale\)/.test(live) && /storefrontDisplay\(pricing, moneyLocale, chargeCurrencyFor\(pricing, base\)\)/.test(live) && /return languageChoiceOf\(/.test(live))
  check("  and an imported theme's", /* Changed on purpose (translation coverage): the card's words come from compatCardIn, then its prices. */ /compatPrices\(worded\.settings, pricing\)/.test(compat) && /compatShop\(site\.shop, pricing/.test(compat) && /themeCountries\(/.test(compat) && /commerceInMarket\(site\.commerce, pricing/.test(compat))
  check("  the shared modules run in the browser", ["lib/markets/compat-prices.ts", "lib/markets/choice.ts", "lib/markets/pricing.ts"].every((f) => !/import "server-only"/.test(read(f))))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the canvas converts its shop, its catalogue, the product page and the cart", /const previewMarket = usePreviewMarket\(installId\)/.test(editor) && /cardsInMarket\(localizeCards\(shopCards/.test(editor) && /cardsInMarket\(localizeCards\(catalogCardsForCanvas/.test(editor) && /_product_data: \{ \.\.\.\(data as Record<string, unknown>\), display \}/.test(editor) && /storefrontDisplay\(previewPricing, moneyLocale/.test(editor) && /display=\{canvasDisplay\}/.test(editor))
  check("  its theme settings as the website's: menus in the language, theme.currency.code in the market", /localizeTheme\(canvasThemeSettings/.test(editor) && /\[DISPLAY_CURRENCY_KEY\]: previewPricing\.currency/.test(editor) && /theme=\{canvasThemeShown\}/.test(editor))
  check("  the theme's switch under the footer, where a choice changes the preview", /language=\{canvasChoice\}/.test(editor) && /languagePreview=\{canvasSwitch\}/.test(editor) && /preview: languagePreview/.test(editor))
  check("  an imported theme gets the markets, its selectors and the prices", /markets=\{compatMarkets\}/.test(editor) && /themeCountries\(\{/.test(editor))
  /* Changed on purpose (the owner: no selectors in the black bar): the theme's own switch is the canvas's. */
  check("  no button over the canvas, and none in a phone's menu", !/PreviewLanguageSwitch/.test(editor) && !/Preview prices in/.test(editor))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("an imported theme's canvas converts with the website's functions", /compatPrices\(card\.settings as unknown as Record<string, unknown>, pricing\)/.test(canvas) && /compatShop\(\{ name: shopName/.test(canvas))
  check("  its language and country selector changes the preview, never the address", /\\\/localization\$\/i\.test\(asked\)/.test(canvas) && /props\.markets\.pick\(/.test(canvas))
  const sw = read("components/website-builder/theme/language-switch.tsx")
  check("the built-in switch in the canvas: no address opened, no cookie written, no link rewritten", /if \(preview\) return preview\.language\(code\)/.test(sw) && /if \(preview\) return preview\.currency\(id\)/.test(sw) && /if \(preview \|\| choice\.code === choice\.defaultLanguage\) return/.test(sw))
  const hook = read("components/website-builder/use-preview-market.ts")
  /* Changed on purpose (the owner: the editor opens on the defaults): opens on the store's own currency, read again when the builder comes back. */
  check("the canvas opens on the store's currency, and reads the markets again when the builder comes back", !/sessionStorage/.test(hook) && /setMarketState\(null\)/.test(hook) && /visibilitychange/.test(hook) && /\/api\/store\/markets\?preview=1/.test(hook))
  check("  only markets a visitor can be in and the day's rates convert are offered", /m\.countries\.length > 0 && pricingFor\(m, info\.base, info\.fx\) !== null/.test(hook))
  const api = read("app/api/store/markets/route.ts")
  check("the preview reads the markets as the live site does, for the website's editors, and writes nothing", /shopCaller\("website"\)/.test(api) && /siteLanguages\(c\.creatorId\)/.test(api) && /fx && fxFresh\(fx\)/.test(api))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)

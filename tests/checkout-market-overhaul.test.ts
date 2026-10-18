/**
 * ===========================================================================
 *  CHECKOUT, CURRENCY, TRANSLATION AND BUILDER: THE SECOND OVERHAUL
 * ===========================================================================
 *   CHARGE     a visitor in a market Storelib can charge pays in its currency,
 *              the amounts the pages showed; any other market shows its prices
 *              for reference and checkout charges the store's, said plainly
 *   MONEY      one formatter: RON is "lei", never a German "L" or "RON 48.00"
 *   CHECKOUT   totals move at once with a quantity, no fade; the delivery
 *              country is known before the first frame; the last line removed
 *              goes back where the buyer came from
 *   JOBS       Translate with AI runs on the server, survives a closed page,
 *              joins a running job, and is picked up when cut off
 *   BUILDER    no language or currency button over the canvas; General
 *              settings says the defaults; the canvas opens on them; every
 *              colour scheme has Edit, which opens that scheme
 */
import { readFileSync } from "node:fs"
import { chargeCurrencyFor, chargeableCurrency, chargingPricing, convertOrder, lineTaxShares, marketCharge } from "@/lib/markets/checkout-charge"
import { checkoutVisitorCountry } from "@/lib/markets/checkout-market-server"
import { pricingFor, moneyFormatFor, type MarketPrice } from "@/lib/markets/pricing"
import { chargeNote, currencyMarkOf, currencyWord, formatCurrency, formatMinor, type FxRates } from "@/lib/markets/money"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { optimisticQuote } from "@/lib/checkout/optimistic-quote"
import { quoteInMarket } from "@/lib/checkout/site-quote-market"
import { currencySymbol } from "@/lib/storelib-theme/compat/objects"
import { couponLabel } from "@/lib/checkout/coupons"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))
const NBSP = " "

const today = new Date().toISOString().slice(0, 10)
const fx: FxRates = { asOf: today, rates: { RON: 5, USD: 1.1, PLN: 4.3 } }
const eur: MarketPrice = { id: "eu", name: "Europe", currency: "EUR", rounding: "none", adjustBps: 0 }
const pln: MarketPrice = { id: "pl", name: "Poland", currency: "PLN", rounding: "none", adjustBps: 0 }

console.log("\nCHARGE: the market's currency when Storelib can charge it")
{
  check("charged: USD, EUR, GBP, RON, CAD, AUD (a fee rule each, two decimals)", ["USD", "EUR", "GBP", "RON", "CAD", "AUD"].every(chargeableCurrency) && !chargeableCurrency("PLN") && !chargeableCurrency("JPY") && !chargeableCurrency(null))
  const pe = pricingFor(eur, "RON", fx)!
  const pp = pricingFor(pln, "RON", fx)!
  check("a lei store's euro market is charged in euro", chargingPricing(pe)?.currency === "EUR" && chargeCurrencyFor(pe, "RON") === "EUR")
  check("  a zloty market shows zloty and is charged in lei", chargingPricing(pp) === null && chargeCurrencyFor(pp, "RON") === "RON")
  check("  and no market: the store's own", chargeCurrencyFor(null, "RON") === "RON")
  const charge = marketCharge(pe)
  /* 100 lei a mug, 2 of them, 10% off; 20 lei shipping; 19% VAT added. In euro at 5 lei a euro. */
  const lines = [{ productId: "p", variantId: null, quantity: 2, unitCents: 10000, discountCents: 2000 }]
  const totals = { itemsSubtotalCents: 20000, discountCents: 2000, shippingCents: 2000, shippingDiscountCents: 0, taxCents: 3800, taxIncluded: false, totalCents: 23800, codFeeCents: 0 }
  const out = convertOrder(lines, totals, charge)
  check("a line is its card's price in euro", out.lines[0].unitCents === 2000 && out.lines[0].quantity === 2, out.lines[0])
  check("  its discount the same share of it", out.lines[0].discountCents === 400, out.lines[0].discountCents)
  check("  shipping at the rate, tax the same share", out.totals.shippingCents === 400 && out.totals.taxCents === 760, out.totals)
  check("  the total added up again from the parts", out.totals.totalCents === 4000 - 400 + 400 + 760, out.totals.totalCents)
  check("  free shipping stays free", convertOrder(lines, { ...totals, shippingDiscountCents: 2000 }, charge).totals.shippingDiscountCents === 400)
  check("  tax shares add up to the tax exactly", (() => {
    const t = lineTaxShares([{ unitCents: 333, quantity: 1, discountCents: 0 }, { unitCents: 333, quantity: 1, discountCents: 0 }, { unitCents: 334, quantity: 1, discountCents: 0 }], 101)
    return t.reduce((n, x) => n + x, 0) === 101
  })())
  const quote = {
    kind: "ships", creatorId: "c", lines: lines.map((l) => ({ ...l, title: "Mug", variantName: null, imageUrl: null, type: "physical", requiresShipping: true, maxQuantity: 9 })), dropped: [], stockIssues: [], requiresShipping: true, coupon: null, couponError: null,
    delivery: { ok: true, options: [{ id: "std", name: "Standard", priceCents: 2000, estimate: "" }], selectedId: "std", needsCountry: false }, pickups: [], totals,
  } as unknown as SiteQuote
  const q = quoteInMarket(quote, charge)
  check("the quote names its currency, and its delivery choices are in it", q.currency === "EUR" && q.delivery.options[0].priceCents === 400)
  check("the note is said only for a currency the checkout cannot charge", chargeNote("EUR", "EUR") === null && /for reference/.test(chargeNote("PLN", "RON") ?? ""))
  check("the visitor's country: their choice, else where they are, never for home", /* Changed on purpose (the owner): a choice is marked "2." (lib/markets/visitor-country.ts); one from before is not read. */ checkoutVisitorCountry("2.DE", "RO") === "DE" && checkoutVisitorCountry(null, "ro") === "RO" && checkoutVisitorCountry("2.home", "RO") === null && checkoutVisitorCountry("DE", "RO") === "RO")
  const route = code("app/api/checkout/site/route.ts")
  check("the quote route converts with the same function", /if \(market\.charge\) answer\.quote = quoteInMarket\(answer\.quote, market\.charge\)/.test(route))
  check("a cart of downloads is charged in it, line by line, with its tax shares", /const chargeCurrency = chargeCurrencyUpper\.toLowerCase\(\)/.test(route) && /priced\.lines\[i\]\.item\.priceCents = l\.unitCents/.test(route) && /lineTaxShares\(converted\.lines/.test(route))
  check("a cart that ships, and cash on delivery, pass the visitor's market", (route.match(/marketCountry: countryOfRequest\(request\)/g) ?? []).length === 3)
  const server = code("lib/physical/checkout-server.ts")
  check("  the held checkout converts its lines, delivery and totals, and keeps the currency", /const converted = convertOrder\(q\.lines, q\.totals, charge\)/.test(server) && /const storeCurrency = market\?\.charge \? market\.chargeCurrency : ownCurrency/.test(server))
  const page = code("app/checkout/site/page.tsx")
  check("the checkout page draws the first quote in it and charges in it", /quoteInMarket\(priced\.quote, market\.charge\)/.test(page) && /<CheckoutCurrency currency=\{market\.chargeCurrency\}>/.test(page))
  check("the live site's cart note follows the same rule", /storefrontDisplay\(pricing, moneyLocale, chargeCurrencyFor\(pricing, base\)\)/.test(code("lib/markets/live.ts")))
}

console.log("\nMONEY: one way to write a currency")
{
  check("RON is lei, after the amount, in English and Romanian", formatCurrency(48, "RON", "en-US") === `48.00${NBSP}lei` && formatCurrency(1234.5, "RON", "ro") === `1.234,50${NBSP}lei`, [formatCurrency(48, "RON", "en-US"), formatCurrency(1234.5, "RON", "ro")])
  check("  never a German L", !/\bL\b/.test(formatCurrency(48, "RON", "de")) && /lei/.test(formatCurrency(48, "RON", "de")), formatCurrency(48, "RON", "de"))
  check("signs stay signs, and CA$ is told from $", formatCurrency(48, "USD", "en-US") === "$48.00" && formatCurrency(48, "EUR", "en-US") === "€48.00" && formatCurrency(48, "CAD", "en-US") === "CA$48.00")
  check("a one-letter word is never used (ZAR keeps its code)", currencyWord("ZAR") === null && currencyWord("RON") === "lei" && currencyWord("PLN") === "zł")
  check("the store's prices, a market's, a field's mark and a theme's money format agree", shopMoneyIn(4800, "RON") === `48.00${NBSP}lei` && formatMinor(4800, "RON", "en") === `48.00${NBSP}lei` && currencyMarkOf("RON").mark === "lei" && /* Changed on purpose (the owner: "5.02 R$" in Romanian; German writes its decimal comma) */ moneyFormatFor("RON", "de") === "{{amount_with_comma_separator}} lei" && currencySymbol("RON") === "lei")
  check("a fixed code in the store's currency, not dollars", couponLabel({ discount_type: "fixed", discount_value: 5 } as never, "RON") === `5.00${NBSP}lei` && couponLabel({ discount_type: "percentage", discount_value: 10 } as never, "RON") === "10%")
  check("no dollar sign left in the delivery line, the pay what you want field or an order's variant", !/`\$\$\{/.test(code("lib/physical/delivery-promise.ts")) && !/aria-hidden>\$<\/span>/.test(code("components/website-builder/sections/renderers/product/product-blocks.tsx")) && !/variant_currency: "USD"/.test(code("lib/checkout/fulfil-payment.ts")))
}

console.log("\nCHECKOUT: at once, from the right country, back where it came from")
{
  const quote = {
    lines: [
      { productId: "a", variantId: null, quantity: 1, unitCents: 1000, discountCents: 100 },
      { productId: "b", variantId: "v", quantity: 2, unitCents: 500, discountCents: 0 },
    ],
    totals: { itemsSubtotalCents: 2000, discountCents: 100, shippingCents: 500, shippingDiscountCents: 0, taxCents: 240, taxIncluded: false, totalCents: 2640 },
  }
  const up = optimisticQuote(quote, [{ productId: "a", variantId: null, quantity: 3 }, { productId: "b", variantId: "v", quantity: 2 }])!
  check("a quantity raised: the line, its discount, the subtotal and the total at once", up.lines[0].quantity === 3 && up.lines[0].discountCents === 300 && up.totals.itemsSubtotalCents === 4000 && up.totals.totalCents === 4000 - 300 + 500 + Math.round((240 * 4200) / 2400), up.totals)
  const gone = optimisticQuote(quote, [{ productId: "b", variantId: "v", quantity: 2 }])!
  check("a line removed leaves the rest", gone.lines.length === 1 && gone.totals.itemsSubtotalCents === 1000)
  check("something the quote never priced waits for the server", optimisticQuote(quote, [{ productId: "c", variantId: null, quantity: 1 }]) === null)
  const site = code("app/checkout/site/site-checkout.tsx")
  check("the total and the quantity never fade while it is priced again", !/quoting && "opacity-60"/.test(site) && !/busy && "opacity-60"/.test(site))
  check("a change shows its amounts at once", /if \(!swap\) setQuote\(\(q\) => \(q \? \(optimisticQuote\(q, next\) \?\? q\) : q\)\)/.test(site))
  check("the first quote is not asked for again for the same country", /firstAsk\.current && shipsKey === pricedWith\.current/.test(site))
  check("the delivery country is there from the first frame, and a pick is remembered", /country: initialCountry \?\? ""/.test(site) && /rememberCheckoutCountry\(address\.country\)/.test(site))
  const page = code("app/checkout/site/page.tsx")
  check("  the page knows it: the last pick, the website's selector, then where they are", /* Changed on purpose (more currencies): where they are wins over the selector's first country of the same market (deliveryCountryGuess). */ /countryCode\(jar\.get\(CHECKOUT_COUNTRY_COOKIE\)\?\.value\) \?\? countryCode\(deliveryCountryGuess\(/.test(page) && /\.\.\.\(initialCountry \? \{ country: initialCountry \} : \{\}\)/.test(page))
  check("the last line removed goes back to the page it came from", /<BackToShop to=\{backTo\} orReferrer=\{backIsDefault\} \/>/.test(site) && /from\.host === window\.location\.host && !from\.pathname\.startsWith\("\/checkout"\)/.test(site))
  const physical = code("app/checkout/physical/physical-checkout.tsx")
  check("  the shop's own checkout too, never an empty page", /emptiedHere\.current && \(backUrl \|\| shopUrl\)\) return <LeaveTo/.test(physical) && /optimisticQuote\(q, next\)/.test(physical))
}

console.log("\nJOBS: Translate with AI on the server")
{
  const jobs = code("lib/markets/translation-jobs.ts")
  check("one job per language: a press while one runs joins it", /row\?\.status === "running" && row\.lease_until && Date\.parse\(row\.lease_until\) > now\) return \{ ok: true, job: view\(row\), run: false \}/.test(jobs))
  check("each round writes the real count, done or failed with why", /done: r\.done,\s*total: r\.total/.test(jobs) && /status: "failed", error: r\.error/.test(jobs))
  check("a run out of time lets go and asks for the next; the cron picks up one cut off", /return \{ more: true \}/.test(jobs) && /lease_until\.is\.null,lease_until\.lt\./.test(jobs))
  const route = code("app/api/store/translations/jobs/route.ts")
  check("the press answers at once and the work goes on after it", /after\(async \(\) => \{\s*const r = await runJob/.test(route))
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] }
  check("the cron is scheduled", vercel.crons.some((c) => c.path === "/api/cron/translation-jobs"))
  check("the press and the job write the same way", /draftRound\(/.test(code("app/api/store/translations/draft/route.ts")) && /draftRound\(/.test(jobs))
  const sheet = code("components/app/settings/translate-sheet.tsx")
  check("the sheet opens on what it showed last, with its shape while it reads, never a blank box", /setData\(loadedCache\.get\(locale\) \?\? null\)/.test(sheet) && /data-translate-loading/.test(sheet) && !/<div className="h-40" aria-busy="true" \/>/.test(sheet))
  check("  and shows the running job's own count", /* Changed on purpose (the owner: one currency, set in Languages & Currency; free open translation). */ /tt\("Translating \{done\} of \{total\}"/.test(sheet) && /startTranslation\(locale\)/.test(sheet))
  const panel = code("components/app/settings/markets-panel.tsx")
  check("the Languages list reads the same jobs, and falls back without part 177", /useTranslationJobs\(\)/.test(panel) && /if \("fallback" in r\) return translateByRounds\(code\)/.test(panel))
  check("part 177 is one statement a line, server only", readFileSync("supabase/sql/run-now/177_translation_jobs.sql", "utf8").includes("REVOKE ALL ON public.store_translation_jobs FROM anon, authenticated;"))
}

console.log("\nBUILDER: the theme's own selectors, the defaults in General")
{
  const editor = code("app/website-builder/editor/[installId]/page.tsx")
  check("no language or currency button over the canvas, and none in the phone's menu", !/PreviewLanguageSwitch/.test(editor) && !/Preview prices in/.test(editor) && !/label: `Preview in /.test(editor))
  check("the canvas opens on the website's own language and the store's currency", /* Changed on purpose (round K3, the owner: "remember the choice per session"): a new tab opens on the defaults; within one tab, on the language and currency last picked for that website. */ /let start: string \| null = null[\s\S]{0,200}sessionStorage\.getItem\(remembered\(installId\)\) \|\| null[\s\S]{0,200}localeRef\.current = start\s*setLocaleState\(start\)/.test(code("components/website-builder/use-preview-language.ts")) && /setMarketState\(start\)\s*void read\(\)/.test(code("components/website-builder/use-preview-market.ts")))
  check("the theme's own switch is still the canvas's, as a preview", /language=\{canvasChoice\}/.test(editor) && /languagePreview=\{canvasSwitch\}/.test(editor))
  const general = code("components/website-builder/website-settings/general.tsx")
  check("General says the default language, the others, the store's currency and visitor currencies", /tt\("Languages and currencies"\)/.test(general) && /tt\("Default language"\)/.test(general) && /tt\("Store currency"\)/.test(general) && /* Changed on purpose (the owner: one currency, set in Languages & Currency; free open translation). */ /tt\("More currencies"\)/.test(general) && /tt\("Store currency"\)\} hint=\{manage\("\/app\/settings\?tab=markets"\)\}/.test(general))
  check("the canvas's market preview is the store's currency, never USD", /base: own,/.test(code("app/api/store/markets/route.ts")) && !/currency: "USD", moneyFormat: "\$\{\{amount\}\}"/.test(code("components/website-builder/compat/compat-canvas.tsx")))
  const control = code("components/website-builder/editor/controls/color-scheme-control.tsx")
  check("every scheme field has Edit, on Storelib's themes and imported ones", /* Changed on purpose (round AJ: Edit sits inside the field) */ /\(\) => env\.openColorSchemes\?\.\(current\)/.test(control) && /onClick=\{onEdit\}/.test(control) && !/if \(!list\) \{/.test(control))
  check("  it opens that scheme: Colors with it chosen, or the imported theme's group with it open", /setCompatSchemeFocus\(\(f\) => \(\{ id: schemeId/.test(editor) && /if \(schemeId\) setEditSchemeKey\(schemeId\)/.test(editor) && /focusScheme=\{compatSchemeFocus\}/.test(editor))
  check("  the theme's own schemes by name, not the defaults", /nativeSchemes\(env\?\.themeSettings \?\? null\)/.test(control) && !/themeColorSchemes\(\{\}\)/.test(editor))
}

console.log("\nNAVIGATION")
{
  check("a collection card goes to its collection on the live site, inert only in the builder", /onClick=\{insideEditor \? \(e\) => e\.preventDefault\(\) : undefined\}/.test(code("components/website-builder/sections/renderers/CollectionListSection.tsx")) && !/href="#">View all/.test(code("components/website-builder/sections/renderers/CollectionListSection.tsx")))
  check("the creator's own page transition outranks the default cut", /:root:root::view-transition-old\(root\)/.test(code("components/website-builder/theme/site-intro.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)

/**
 * ===========================================================================
 *  CURRENCY ROUND AM: EVERY AMOUNT IN THE CURRENCY IT IS REALLY IN
 * ===========================================================================
 * What has to hold, approved in docs/audits/currency-audit-2026-10-18.md:
 *
 *   PLANS        membership and community plans are dollars everywhere,
 *                never relabelled as the store's currency
 *   MARKETPLACE  behind MARKETPLACE_USD (off by default, server only):
 *                Explore, creator pages, product pages on Storelib and the
 *                wishlist show and charge US dollars, converted once at the
 *                ECB rate of one day, rounded to the cent, a minimum rounded
 *                up, a creator's approved dollar price used as set; no fresh
 *                rate pauses the purchase, never a switch to the store's
 *                currency; the website, OnePage and shared links never change
 *   REPORTS      every sale counted in the store's currency at its own day's
 *                rate; one no rate converts is counted apart, never guessed
 *   NO GUESSES   no money path writes "usd" for a currency it does not know;
 *                the static rate table and the unused rate route are gone
 *   SQL          part 244 only adds nullable columns with checks
 */
import { readFileSync, existsSync } from "node:fs"
import { stripComments } from "./_source"
import { fakeDb } from "./_fake-db"
import { resetMarketplaceLaunchCache } from "@/lib/money/marketplace"
import {
  MARKETPLACE_CURRENCY,
  approvedUsdPrice,
  couponValueInUsd,
  gateOpenFor,
  marketplaceAmounts,
  parseMarketplaceGate,
  pricingContextOf,
  RATES_PAUSED_MESSAGE,
  toUsdMinor,
} from "@/lib/money/marketplace"
import { PLAN_CURRENCY, isPlanPriced, productPriceCurrency } from "@/lib/money/product-currency"
import { dayOf, inReportingCurrency, needsConversion, ratesForDate, RATE_LOOKBACK_DAYS } from "@/lib/money/report-currency"
import { PRICING_METADATA_KEY, encodePricing, orderPricingFrom } from "@/lib/money/order-pricing"
import { formatPlatformMoney } from "@/lib/i18n/currency"
import { listPrice } from "@/lib/pricing/list-price"
import { money as notifyMoney } from "@/lib/notifications/format"
import { actionOf, entryOf, priceOf } from "@/components/wishlist/wishlist-entry"
import { priceOrder, requestedContext } from "@/lib/checkout/pricing"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const today = new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
/* Per euro, as the ECB publishes them. */
const RATES = { USD: 1.08, RON: 4.97, GBP: 0.86, CAD: 1.48, AUD: 1.64 }
const fresh = { asOf: today, rates: RATES }
const stale = { asOf: daysAgo(9), rates: RATES }

const STORE = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const PRODUCT = "33333333-3333-4333-8333-333333333333"

async function main() {
  console.log("Which currency a product's own price is in")
  {
    check("a membership is a dollar plan", isPlanPriced({ type: "membership" }) && productPriceCurrency({ type: "membership" }, "RON") === PLAN_CURRENCY)
    check("a community plan too", productPriceCurrency({ type: "community" }, "EUR") === "USD")
    check("anything else is its store's", productPriceCurrency({ type: "digital" }, "RON") === "RON")
    check("a $9 plan never reads lei on a card", /\$/.test(listPrice({ price_cents: 900, type: "membership", currency: "RON" }).main) && !/lei|RON/i.test(listPrice({ price_cents: 900, type: "membership", currency: "RON" }).main))
  }

  console.log("\nThe marketplace switch")
  {
    check("off unless set", parseMarketplaceGate(undefined).mode === "off" && parseMarketplaceGate("").mode === "off" && parseMarketplaceGate("off").mode === "off")
    check("anything unreadable is off", parseMarketplaceGate("maybe").mode === "off")
    check("all is every store", gateOpenFor(parseMarketplaceGate("all"), STORE) && gateOpenFor(parseMarketplaceGate("on"), OTHER))
    const some = parseMarketplaceGate(`${STORE}, not-an-id`)
    check("a list is those stores only, for a gradual rollout", gateOpenFor(some, STORE) && !gateOpenFor(some, OTHER) && !gateOpenFor(some, null))
    check("never a public variable", !/NEXT_PUBLIC_MARKETPLACE_USD/.test(code("lib/money/marketplace-server.ts")) && /process\.env\.MARKETPLACE_USD/.test(code("lib/money/marketplace-server.ts")))
  }

  console.log("\nWhich places are the marketplace")
  {
    check("Explore, a creator page, a product page and a community", ["explore", "profile", "product", "community"].every((s) => pricingContextOf(s) === "marketplace"))
    check("the website, OnePage, a shared link and admin are the store's own", ["website", "onepage", "link", "admin", undefined, null, "anything"].every((s) => pricingContextOf(s) === "merchant"))
    check("a Buy link's ctx=mp is the marketplace, nothing else is", requestedContext("mp") === "marketplace" && requestedContext(undefined) === "merchant" && requestedContext("website") === "merchant")
  }

  console.log("\nDollars from the day's rate")
  {
    /* 49 lei at 1.08 / 4.97 = $10.648 */
    check("49 lei is $10.65, to the cent", toUsdMinor(4900, "RON", fresh) === 1065, toUsdMinor(4900, "RON", fresh))
    check("a minimum rounds up, never below what the creator asked", toUsdMinor(4900, "RON", fresh, { round: "up" }) === 1065 && toUsdMinor(4901, "RON", fresh, { round: "up" })! >= Math.ceil((4901 / 100) * (1.08 / 4.97) * 100 - 1e-6))
    check("no psychological rounding: not $10.99, not $11", toUsdMinor(4900, "RON", fresh) !== 1099 && toUsdMinor(4900, "RON", fresh) !== 1100)
    check("euros through the euro's own rate", toUsdMinor(1000, "EUR", fresh) === 1080)
    check("dollars are dollars", toUsdMinor(1234, "USD", null) === 1234)
    check("a rate older than the safety window is not used", toUsdMinor(4900, "RON", stale) === null)
    check("no rates at all: nothing, never a guess", toUsdMinor(4900, "RON", null) === null)
    check("a currency the day has no rate for: nothing", toUsdMinor(4900, "XYZ", fresh) === null)
    check("a fixed code amount converts at the same rate", couponValueInUsd(5, "RON", fresh) === 1.09, couponValueInUsd(5, "RON", fresh))
  }

  console.log("\nA product's marketplace amounts")
  {
    const lei = marketplaceAmounts({ type: "digital", price_cents: 4900, compare_at_cents: 9900 }, "RON", fresh)
    check("converted, with its rate day", lei.ok && lei.price_cents === 1065 && lei.source === "converted" && lei.fxAsOf === today, lei)
    check("its struck-through price converted the same way", lei.ok && lei.compare_at_cents === toUsdMinor(9900, "RON", fresh))
    const plan = marketplaceAmounts({ type: "membership", price_cents: 900 }, "RON", fresh)
    check("a dollar plan is never converted", plan.ok && plan.price_cents === 900 && plan.source === "native" && plan.fxAsOf === null)
    const usdStore = marketplaceAmounts({ type: "digital", price_cents: 2500 }, "USD", null)
    check("a dollar store needs no rate at all", usdStore.ok && usdStore.price_cents === 2500)
    const fixed = marketplaceAmounts({ type: "digital", price_cents: 4900, marketplace_usd_cents: 999, marketplace_usd_approved_at: "2026-10-18T10:00:00Z" }, "RON", fresh)
    check("the creator's approved dollar price is used exactly as set", fixed.ok && fixed.price_cents === 999 && fixed.source === "fixed")
    check("a dollar price nobody approved is not", approvedUsdPrice({ marketplace_usd_cents: 999 }) === null && (marketplaceAmounts({ type: "digital", price_cents: 4900, marketplace_usd_cents: 999 }, "RON", fresh) as { price_cents: number }).price_cents === 1065)
    check("no fresh rate: refused, so the purchase waits", marketplaceAmounts({ type: "digital", price_cents: 4900 }, "RON", stale).ok === false)
    const pwyw = marketplaceAmounts({ type: "digital", price_cents: 0, pwyw_min_price_cents: 1001 }, "RON", fresh)
    check("a pay-what-you-want minimum rounds up", pwyw.ok && pwyw.pwyw_min_price_cents === Math.ceil((10.01 * 1.08 / 4.97) * 100))
    check("the marketplace's currency is US dollars", MARKETPLACE_CURRENCY === "USD")
  }

  console.log("\nThe charge: priceOrder")
  {
    const tables = () => ({
      products: [{ id: PRODUCT, creator_id: STORE, type: "digital", status: "published", title: "Pack", slug: "pack", price_cents: 4900, thumbnail_url: null, pay_what_you_want: false }],
      product_variants: [],
      store_settings: [{ creator_id: STORE, currency: "RON", default_country: "RO" }],
      fx_rates: [{ as_of: today, rates: RATES }],
      /* Changed on purpose (currency round AP): "all" is locked until this launch row exists (lib/money/marketplace resolveMarketplaceGate). */
      platform_migrations: [{ key: "marketplace_usd_launch", applied_at: today }],
      coupons: [{ id: "c0000000-0000-4000-8000-000000000001", creator_id: STORE, code: "FIVE", discount_type: "fixed", discount_value: 5, is_active: true, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, min_purchase_cents: null }],
    })
    const before = process.env.MARKETPLACE_USD
    try {
      delete process.env.MARKETPLACE_USD
      const off = await priceOrder(fakeDb(tables()) as never, { productId: PRODUCT, pricing: { context: "mp" } })
      check("switch off: the marketplace charges the store's currency, as before", off.ok && off.currency === "RON" && off.totals.totalCents === 4900 && off.pricing.context === "merchant", off)

      process.env.MARKETPLACE_USD = "all"
      resetMarketplaceLaunchCache()
      const unverified = tables()
      ;(unverified as { platform_migrations: unknown[] }).platform_migrations = []
      const locked = await priceOrder(fakeDb(unverified) as never, { productId: PRODUCT, pricing: { context: "mp", fxAsOf: today } })
      check("\"all\" before the launch is verified: still the store's currency (locked)", locked.ok && locked.currency === "RON" && locked.pricing.context === "merchant", locked)
      resetMarketplaceLaunchCache()
      const site = await priceOrder(fakeDb(tables()) as never, { productId: PRODUCT })
      check("switch on: the store's own places still charge its currency", site.ok && site.currency === "RON" && site.totals.totalCents === 4900)
      const mp = await priceOrder(fakeDb(tables()) as never, { productId: PRODUCT, pricing: { context: "mp", fxAsOf: today } })
      check("switch on: the marketplace charges dollars at the day's rate", mp.ok && mp.currency === "USD" && mp.totals.totalCents === 1065, mp)
      check("and records how: the store's price, the rate day, the rate", mp.ok && mp.pricing.context === "marketplace" && mp.pricing.listCurrency === "RON" && mp.pricing.listAmountCents === 4900 && mp.pricing.fxAsOf === today && (mp.pricing.fxRate ?? 0) > 0.21 && (mp.pricing.fxRate ?? 0) < 0.22, mp.ok ? mp.pricing : mp)
      const coded = await priceOrder(fakeDb(tables()) as never, { productId: PRODUCT, couponCode: "FIVE", pricing: { context: "mp" } })
      check("a 5 lei code is $1.09 off at the same rate", coded.ok && coded.totals.discountCents === 109 && coded.totals.totalCents === 1065 - 109, coded.ok ? coded.totals : coded)
      const moved = await priceOrder(fakeDb(tables()) as never, { productId: PRODUCT, pricing: { context: "mp", fxAsOf: daysAgo(9) } })
      check("a page priced at a day that went stale is asked to refresh, never charged at a newer rate", moved.ok === false && moved.status === 409 && moved.code === "price_changed", moved)
      const old = tables()
      old.fx_rates = [{ as_of: daysAgo(9), rates: RATES }]
      const paused = await priceOrder(fakeDb(old) as never, { productId: PRODUCT, pricing: { context: "mp" } })
      check("no fresh rate: paused (503), never charged in lei instead", paused.ok === false && paused.status === 503 && paused.code === "rates_paused", paused)
      const plan = tables()
      plan.products[0].type = "membership"
      const planned = await priceOrder(fakeDb(plan) as never, { productId: PRODUCT, pricing: { context: "mp" } })
      check("a dollar plan on the marketplace is charged its own dollars", planned.ok && planned.currency === "USD" && planned.totals.totalCents === 4900)
    } finally {
      if (before === undefined) delete process.env.MARKETPLACE_USD
      else process.env.MARKETPLACE_USD = before
    }
  }

  console.log("\nThe checkout carries the price it showed")
  {
    const session = code("app/api/checkout/stripe-session/route.ts")
    check("stripe-session passes the page's pricing to priceOrder", /pricing: body\.pricing && typeof body\.pricing === "object"/.test(session))
    check("and charges what priceOrder priced", /const storeCurrency = priced\.currency/.test(session) && /chargeCurrency = storeCurrency\.toLowerCase\(\)/.test(session))
    check("and writes how a marketplace price was made, in one metadata key, before the 50-key check", /priced\.pricing\.context === "marketplace"\) metadata\[PRICING_METADATA_KEY\] = encodePricing\(priced\.pricing\)/.test(session) && /fitStripeMetadata\(metadata\)/.test(session))
    check("a pause is answered with its own code", /priced\.code \? \{ code: priced\.code \}/.test(session))
    const page = code("app/checkout/page.tsx")
    /* Changed on purpose (round AQ): ?ctx=mp, or a storelib.com marketplace page before it; never a website (?site=). */ check("the checkout page converts only on the marketplace with the switch on", /const onMarketplace = ctx === "mp" \|\| \(!ctx && !site && marketplaceReferrer\(/.test(page) && /onMarketplace && priceCurrency !== MARKETPLACE_CURRENCY && \(await marketplaceUsdFor\(product\.creator_id\)\)/.test(page)) /* Changed on purpose (currency round AP): the switch is awaited (launch lock). */
    check("and waits, with a plain message, when no rate is fresh", /<RatesPaused/.test(page) && page.includes(`checkoutMsg("${RATES_PAUSED_MESSAGE}")`))
    const client = code("app/checkout/checkout-client.tsx")
    check("the client sends the pricing back with Pay and with a code", (client.match(/\bpricing,/g) ?? []).length >= 2)
    check("order rows note it, without ever failing the order", /tagOrderPricing\(admin, order\.id/.test(code("lib/checkout/fulfil-payment.ts")) && /tagOrderPricing\(supabaseAdmin, order\.id/.test(code("app/api/stripe/webhook/route.ts")))
    const packed = encodePricing({ context: "marketplace", listCurrency: "RON", listAmountCents: 4900, source: "converted", fxAsOf: today, fxRate: 0.2173 })
    const row = orderPricingFrom({ [PRICING_METADATA_KEY]: packed })
    check("the order's columns, from the one key, checked", !!row && row.pricing_context === "marketplace" && row.list_currency === "ron" && row.list_amount_cents === 4900 && row.price_source === "converted" && row.fx_as_of === today && row.fx_rate === 0.2173, row)
    check("nothing recorded from a payment that carries none", orderPricingFrom({}) === null && orderPricingFrom({ [PRICING_METADATA_KEY]: "elsewhere|x" }) === null)
    const session2 = code("app/api/checkout/stripe-session/route.ts")
    const mdBlock = session2.slice(session2.indexOf("const metadata: Record<string, string> = {"), session2.indexOf("Object.assign(metadata, attributionToMetadata"))
    const fixedKeys = (mdBlock.match(/^\s+(\[[A-Z_]+\]|[a-z_]+):/gm) ?? []).length
    check("a store-currency checkout adds no metadata key (42 fixed + 8 business + 2 holds stays where it was)", fixedKeys <= 42, fixedKeys)
  }

  console.log("\nThe marketplace's pages")
  {
    check("Explore prices its cards through the marketplace", /marketplacePricer\(createAdminClient\(\)/.test(code("app/(marketing)/explore/page.tsx")) && /\.\.\.priceOf\(product\)/.test(code("app/(marketing)/explore/page.tsx")))
    check("and its categories", /marketplacePricer\(createAdminClient\(\)/.test(code("app/(marketing)/explore/[category]/page.tsx")))
    check("a creator page's cards", /marketplacePricer\(createAdminClient\(\), \[creator\.id\], /.test(code("app/(marketing)/u/[username]/page.tsx")))
    const p = code("app/(marketing)/p/[slug]/page.tsx")
    check("a product page: the product and each option at one rate day", /productPageQuote\(loaded/.test(p) && /pageQuote\.convert\(loaded\)/.test(p) && /productVariants\.map\(\(v\) => pageQuote\.convert\(/.test(p))
    check("its Buy links carry the marketplace and the rate day", /<MarketplaceQuote active=/.test(code("components/platform/product-page-frame.tsx")) && /ProductPageFrame\(\{ slug, children/.test(code("app/(marketing)/[sellername]/[productSlug]/page.tsx")) && /useCheckoutHref\(\)/.test(code("components/checkout/buy-button.tsx")) && /useCheckoutHref\(\)/.test(code("components/checkout/smart-buy-button.tsx")))
    const e = entryOf({ id: "w", product_id: PRODUCT, created_at: today, products: { id: PRODUCT, title: "Pack", slug: "pack", type: "digital", price_cents: 4900, currency: "RON" } })!
    check("the wishlist writes a lei price in lei, never as dollars", /lei|RON/i.test(priceOf(e).main) && !/\$/.test(priceOf(e).main), priceOf(e))
    check("with the switch off its Buy is the link it always was", actionOf(e).href === `/checkout?productId=${PRODUCT}`)
    const priced = entryOf({ id: "w", product_id: PRODUCT, created_at: today, products: { id: PRODUCT, title: "Pack", slug: "pack", type: "digital", price_cents: 1065, currency: "USD", fx_as_of: today } })!
    check("priced by the marketplace, its Buy carries the marketplace and the rate day", actionOf(priced).href === `/checkout?productId=${PRODUCT}&ctx=mp&fx=${today}`)
    const waiting = entryOf({ id: "w", product_id: PRODUCT, created_at: today, products: { id: PRODUCT, title: "Pack", slug: "pack", type: "digital", price_cents: 4900, currency: "RON", marketplace_paused: true } })!
    check("waiting for a rate, its Buy goes to the marketplace's checkout, which waits too", actionOf(waiting).href === `/checkout?productId=${PRODUCT}&ctx=mp`)
  }

  console.log("\nPhysical products are the website's only")
  {
    check("a product page sends a physical product to its website", /product\.type === "physical"/.test(code("app/(marketing)/p/[slug]/page.tsx")))
    check("the wishlist leaves them out", /item\.products\.type === "physical"/.test(code("app/api/wishlist/route.ts")) && /r\.products\.type !== "physical"/.test(code("app/account/library/wishlist/load-wishlist.ts")))
    check("the single-product checkout refuses one", /type === "physical"\) return \{ ok: false/.test(code("lib/checkout/pricing.ts")))
  }

  console.log("\nReports in the store's currency, at each sale's own day")
  {
    const days = [{ asOf: daysAgo(3), rates: RATES }, { asOf: today, rates: { ...RATES, RON: 5.0 } }]
    check("a weekend sale uses the last published day", !!ratesForDate(days, daysAgo(1)) && ratesForDate(days, daysAgo(1))!.asOf === daysAgo(3))
    check(`no rate more than ${RATE_LOOKBACK_DAYS} days back`, ratesForDate([{ asOf: daysAgo(20), rates: RATES }], today) === null)
    const rows = [
      { created_at: `${today}T10:00:00Z`, currency: "ron", amount_cents: 5000 },
      { created_at: `${today}T10:00:00Z`, currency: "usd", amount_cents: 1000, refund_amount_cents: 500 },
      { created_at: `${daysAgo(40)}T10:00:00Z`, currency: "eur", amount_cents: 1000 },
      { created_at: `${today}T10:00:00Z`, currency: null, amount_cents: 700 },
    ]
    const r = inReportingCurrency(rows, "RON", days)
    check("a lei sale is counted exactly as it is", r.rows[0].amount_cents === 5000 && r.rows[0] === rows[0])
    check("a dollar sale at that day's rate, refund included", r.rows[1].amount_cents === Math.round(10 * (5.0 / 1.08) * 100) && r.rows[1].refund_amount_cents === Math.round(5 * (5.0 / 1.08) * 100), r.rows[1])
    check("a sale no rate converts is left out and counted, never guessed", r.unconverted === 1 && r.rows.length === 3)
    check("a sale with no currency is kept and counted as unknown", r.unknown === 1 && r.rows.some((x) => x.amount_cents === 700))
    check("the order rows themselves never change", rows[1].amount_cents === 1000 && rows[1].currency === "usd")
    check("rates are read only when some sale needs them", !needsConversion([rows[0], rows[3]], "RON") && needsConversion(rows, "RON"))
    check("a day is the ECB's calendar day", dayOf("2026-10-18T23:30:00Z") === "2026-10-18")
    check("the revenue chart is in the store's currency", /inStoreCurrency\(adminSupabase, creator\.id/.test(code("app/api/stripe/revenue-chart/route.ts")) && !/salesCurrencyOf/.test(code("app/api/stripe/revenue-chart/route.ts")))
    check("Payouts' 1099-K years are converted to dollars, not relabelled", /taxYearsInUsd\(/.test(code("app/app/payouts/page.tsx")) && /taxYearsInUsd\(/.test(code("app/api/stripe/payouts/route.ts")) && /inStoreCurrency\(adminSupabase, creator\.id,[\s\S]{0,400}?"USD"\)/.test(code("app/api/stripe/tax-summary/route.ts")))
    check("Analytics says when sales were converted", /data-analytics-converted/.test(code("app/app/analytics/analytics-reports.tsx")) && /conversion: o\.conversion/.test(code("app/api/analytics/reports/route.ts")))
  }

  console.log("\nNo guessed currency, no made-up rate")
  {
    check("the static rate table is gone", !/USD_RATES|4\.6/.test(code("lib/i18n/currency.ts")))
    check("a platform price is written in its own currency, never converted", /10/.test(formatPlatformMoney(1000, "EUR")) && !/50/.test(formatPlatformMoney(1000, "EUR")))
    check("the unused rate route with its fallback rates is gone", !existsSync("app/api/fx/route.ts"))
    check("no Frankfurter anywhere in the app", !/frankfurter/i.test(code("app/api/stripe/cashout/route.ts")) && !existsSync("lib/exchange-rate.ts"))
    for (const f of ["lib/checkout/fulfil-payment.ts", "lib/memberships/sync.ts", "lib/stripe/refund-sync.ts", "app/api/invoice/route.ts", "app/api/stripe/refund/route.ts", "app/api/admin/orders/refund/route.ts", "app/api/cron/release-holds/route.ts", "lib/payments/refunds.ts"]) {
      check(`${f}: no "usd" written for an unknown currency`, !/(\|\||\?\?) ?["']usd["']/i.test(code(f)) && !/currency: ["']usd["']/i.test(code(f)))
    }
    check("a notification never writes $ (or a bare number) for a currency nobody recorded", notifyMoney(1234, null) === "" && /€|EUR/.test(notifyMoney(1234, "eur")))
    check("the settings note is said only when the marketplace is in dollars for the store", /marketplaceUsd: await marketplaceUsdFor\(creatorId\)/.test(code("app/api/store/currency/route.ts")) && /!data\?\.marketplaceUsd/.test(code("components/app/settings/country-currency.tsx")))
  }

  console.log("\nSQL part 244")
  {
    const sql = read("supabase/sql/run-now/244_marketplace_pricing.sql")
    check("the migration is the same file", sql === read("supabase/migrations/20270203_am_marketplace_pricing.sql"))
    check("only adds nullable columns and checks", /ADD COLUMN IF NOT EXISTS pricing_context/.test(sql) && /ADD COLUMN IF NOT EXISTS marketplace_usd_cents/.test(sql) && !/DROP |UPDATE public|DELETE FROM/i.test(sql.split("\n").slice(1).join("\n")))
    check("the check after running knows it", /as p244_marketplace_pricing/.test(read("supabase/sql/run-now/99_check_after.sql")) && /244_marketplace_pricing\.sql/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

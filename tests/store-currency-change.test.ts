/**
 * ===========================================================================
 *  A STORE CHANGES ITS CURRENCY: WHAT MOVES, WHAT STAYS, WHAT IS ASKED AGAIN
 * ===========================================================================
 * Settings › Languages & Currency changes `store_settings.currency`
 * (app/api/store/currency, SQL parts 176 and 258). This walks a euro store
 * that moves to lei, converting its prices, over the journey harness (the
 * real routes on an in-memory database), and pins what has to hold:
 *
 *   CATALOG    every price the store owns is converted, and nothing else:
 *              membership and community plans stay in dollars; offers'
 *              fixed amounts and minimums and smart collections' price
 *              conditions are converted too (part 258)
 *   MARKETS    More currencies follow the new base: a market's own rate is
 *              rescaled when prices were converted, dropped when kept, and
 *              put back at the inverse rate by Undo
 *   CACHES     the store currency, shop, creator, localization and every
 *              product page's tags are EXPIRED (Next 16 `{ expire: 0 }`),
 *              not marked stale for the next visitor to see the old
 *              currency once; the open app refreshes the router's kept
 *              pages and Settings' kept reads
 *   HISTORY    orders keep their own currency; totals over orders in two
 *              currencies are converted at each day's rate or left out,
 *              never added cent for cent (Orders' figures, the physical
 *              Analytics card, the sales breakdown's list prices)
 *   LABELS     no "$" for a store that does not sell in dollars: the home
 *              chart's axis, the revenue goal, smart collection rules, a pay
 *              what you want minimum, a plan in /app search
 *
 * Run: node scripts/run-push-tests.mjs (in SUITES)
 */
import "./_journey/env"
import { readFileSync, existsSync } from "node:fs"
import { Journey } from "./_journey/harness"
import { marketsForNewBase } from "@/lib/markets/base-change"
import { compactMoney } from "@/lib/analytics/chart-scale"
import { METRICS, moneyFrom, type MetricReading } from "@/lib/orders/metrics"
import { inReportingCurrency } from "@/lib/money/report-currency"
import { lineBreakdown } from "@/lib/analytics/commerce"
import { challenges, NO_FACTS } from "@/lib/home/progress"
import { baseFor } from "@/lib/checkout/pricing"
import { stripComments } from "./_source"
import { CURRENCY_CHANGED, currencyChangedSince } from "@/lib/store/currency-guard"
import { cartNeedsReprice, parseCart, repricedLines, serializeCart, type CartLine } from "@/lib/website-builder/cart"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const src = (p: string) => stripComments(readFileSync(p, "utf8"))
const raw = (p: string) => readFileSync(p, "utf8")

const RON_PER_EUR = 4.9775
const DAY = 86_400_000
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

async function main() {
  const j = await Journey.start()
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { readOrdersListing } = await import("@/lib/orders/paged")
  const { physicalAnalytics } = await import("@/lib/physical/analytics-server")
  const { DEFAULT_QUERY } = await import("@/lib/orders/order-view")
  const { storeCurrencyTag } = await import("@/lib/store/selling-currency-server")
  const { creatorShopTag } = await import("@/lib/website-builder/published-site")
  const { creatorTag, productTag } = await import("@/lib/commerce/product-page-cache")
  const { localizationTag } = await import("@/lib/markets/server")

  section("1. A euro store with prices, a dollar plan, an offer, a smart collection and a pound market")
  const seller = await j.signUp("change@example.com", { name: "Carla Change" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "carla-shop" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Carla Shop", defaultCountry: "DE" } })
  const eur = await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "carla-eur-0001" } })
  check("the store sells in EUR", eur.status === 200 && eur.json?.currency === "EUR", eur.json)

  const now = Date.now()
  for (const at of [now, now - 2 * DAY, now - 3 * DAY]) {
    j.db.insert("fx_rates", { as_of: day(at), base: "EUR", rates: { RON: RON_PER_EUR, USD: 1.08, GBP: 0.85 }, source: "ecb", fetched_at: new Date().toISOString() }, {})
  }
  const [ebook] = j.db.insert("products", { creator_id: creator.id, type: "digital", title: "Ebook", slug: "ebook", status: "published", price_cents: 1000, compare_at_cents: 2000, thumbnail_url: "https://cdn.example.com/p.jpg" }, {})
  const [club] = j.db.insert("products", { creator_id: creator.id, type: "membership", title: "Club", slug: "club", status: "published", price_cents: 1000, thumbnail_url: "https://cdn.example.com/p.jpg" }, {})
  const [offer] = j.db.insert("store_offers", { creator_id: creator.id, kind: "checkout", title: "Add on", product_ids: [ebook.id], discount_type: "fixed", discount_value: 500, min_subtotal_cents: 3000, active: true }, {})
  const [cheap] = j.db.insert("product_collections", { creator_id: creator.id, title: "Under 30", slug: "under-30", kind: "smart", rules: [{ field: "price", op: "lt", value: "30" }, { field: "tag", op: "eq", value: "sale" }], match: "all" }, {})

  const m0 = await j.call("GET /api/store/markets", { as: seller })
  const loc = m0.json?.localization
  const home = (loc?.markets ?? []).find((m: any) => m.primary)
  const putMarkets = await j.call("PUT /api/store/markets", {
    as: seller,
    body: { localization: { ...loc, markets: [{ ...home, countries: ["DE"] }, { id: "uk", name: "United Kingdom", countries: ["GB"], currency: "GBP", language: null, active: true, primary: false, rounding: "none", adjustBps: 0, rate: 0.85 }] } },
  })
  const ukBefore = (putMarkets.json?.localization?.markets ?? []).find((m: any) => m.id === "uk")
  check("a pound market at the store's own rate, 1 EUR = 0.85 GBP", putMarkets.status === 200 && ukBefore?.rate === 0.85, putMarkets.json)

  section("2. What a change would touch, before it is made")
  const preview = await j.call("POST /api/store/currency", { as: seller, body: { currency: "RON" } })
  check("the day's rate is offered", preview.status === 200 && preview.json?.rate > 4.9 && preview.json?.rate < 5.1, preview.json)
  check("the dollar plan is not counted among the prices it converts", preview.json?.counts?.products === 1, preview.json?.counts)
  check("the fixed offer is", preview.json?.counts?.offers === 1, preview.json?.counts)
  check("the examples never show a plan converted", (preview.json?.examples ?? []).every((e: any) => e.title !== "Club"), preview.json?.examples)

  section("3. Converted to lei")
  const calls: { tag: string; profile: unknown }[] = []
  const paths: string[] = []
  const g = globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }
  g.__PUSH_TEST_NEXT_CACHE__ = {
    unstable_cache: (fn: unknown) => fn,
    revalidateTag: (tag: string, profile: unknown) => void calls.push({ tag, profile }),
    revalidatePath: (p: string) => void paths.push(p),
    updateTag: (tag: string) => void calls.push({ tag, profile: { expire: 0 } }),
  }
  const put = await j.call("PUT /api/store/currency", { as: seller, body: { currency: "RON", mode: "convert", rate: preview.json?.rate, asOf: preview.json?.asOf, key: "carla-ron-0001" } })
  delete g.__PUSH_TEST_NEXT_CACHE__
  const rate = Number(preview.json?.rate)
  check("the store sells in RON", put.status === 200 && put.json?.currency === "RON", put.json)
  const row = (t: string, id: unknown) => j.rows(t).find((r) => r.id === id) as Record<string, any>
  check("the ebook's price and compare-at are converted", row("products", ebook.id).price_cents === Math.round(1000 * rate) && row("products", ebook.id).compare_at_cents === Math.round(2000 * rate), row("products", ebook.id))
  check("the membership plan stays $10.00: it is billed in dollars", row("products", club.id).price_cents === 1000, row("products", club.id))
  check("the offer's fixed amount and minimum basket are converted", row("store_offers", offer.id).discount_value === Math.round(500 * rate) && row("store_offers", offer.id).min_subtotal_cents === Math.round(3000 * rate), row("store_offers", offer.id))
  const rules = row("product_collections", cheap.id).rules as { field: string; value: string }[]
  check("the collection's price condition is converted, its tag condition untouched", Number(rules[0].value) === Math.round(30 * rate * 100) / 100 && rules[1].value === "sale", rules)

  const expired = (tag: string) => calls.some((c) => c.tag === tag && (c.profile as { expire?: number } | undefined)?.expire === 0)
  check("the store currency, shop, creator and localization caches are expired, not left stale", [storeCurrencyTag(creator.id), creatorShopTag(creator.id), creatorTag(creator.id), localizationTag(creator.id)].every(expired), calls)
  check("no tag of the change is only marked stale (\"max\" hands the next visitor the old currency)", calls.every((c) => c.profile !== "max"), calls.filter((c) => c.profile === "max"))
  check("each product's own page is expired, by id and by address", expired(productTag(ebook.id as string)) && expired(productTag("ebook")), calls.map((c) => c.tag))

  const m1 = await j.call("GET /api/store/markets", { as: seller })
  const ukAfter = (m1.json?.localization?.markets ?? []).find((m: any) => m.id === "uk")
  check("Languages & Currency reads RON as the base", m1.json?.baseCurrency === "RON", m1.json?.baseCurrency)
  check("the pound market's own rate is rescaled from the new base: a visitor in the UK sees the same pounds", ukAfter && Math.abs(ukAfter.rate - Number((0.85 / rate).toPrecision(6))) < 1e-9, ukAfter)
  check("the same press again converts nothing twice", (await j.call("PUT /api/store/currency", { as: seller, body: { currency: "RON", mode: "convert", rate, asOf: preview.json?.asOf, key: "carla-ron-0001" } })).status === 200 && row("products", ebook.id).price_cents === Math.round(1000 * rate))

  section("3b. A price form opened before the change never writes its old prices back")
  check("the guard: a form loaded in EUR saving into a RON store is refused, one that says nothing is not", currencyChangedSince("EUR", "RON") && currencyChangedSince("eur", "RON") && !currencyChangedSince("RON", "RON") && !currencyChangedSince(undefined, "RON") && !currencyChangedSince("EUR", null))
  const only = await j.call("GET /api/store/currency?only=currency", { as: seller })
  check("the editor asks the store's currency before it saves, cheaply", only.status === 200 && only.json?.currency === "RON" && only.json?.catalog === undefined, only.json)
  const staleCoupon = await j.call("POST /api/coupons", { as: seller, body: { code: "OLD5", discount_type: "fixed", discount_value: 5, formCurrency: "EUR" } })
  check("a coupon typed in euros is refused with what to do", staleCoupon.status === 409 && staleCoupon.json?.error === CURRENCY_CHANGED && !j.rows("coupons").some((c) => c.code === "OLD5"), { status: staleCoupon.status, body: staleCoupon.json })
  const freshCoupon = await j.call("POST /api/coupons", { as: seller, body: { code: "NEW5", discount_type: "fixed", discount_value: 5, formCurrency: "RON" } })
  check("  one typed in lei is saved", freshCoupon.status === 200 || freshCoupon.status === 201, { status: freshCoupon.status, body: freshCoupon.json })
  const couponId = j.rows("coupons").find((c) => c.code === "NEW5")?.id
  const staleEdit = await j.call(`PUT /api/coupons/${couponId}`, { as: seller, body: { code: "NEW5", discount_type: "fixed", discount_value: 1, formCurrency: "EUR" } })
  check("  and an edit from a form opened in euros is refused, the saved amount untouched", staleEdit.status === 409 && Number(j.rows("coupons").find((c) => c.id === couponId)?.discount_value) === 5, { status: staleEdit.status, body: staleEdit.json })
  const offerBefore = row("store_offers", offer.id).discount_value
  const staleOffer = await j.call("PUT /api/store/offers", { as: seller, body: { id: offer.id, kind: "checkout", title: "Add on", productIds: [ebook.id], discountType: "fixed", discountValue: 500, placements: ["checkout"], formCurrency: "EUR" } })
  check("an offer edited in euros is refused, its converted amount kept", staleOffer.status === 409 && staleOffer.json?.error === CURRENCY_CHANGED && row("store_offers", offer.id).discount_value === offerBefore, { status: staleOffer.status, body: staleOffer.json })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const [mug] = j.db.insert("products", { creator_id: creator.id, type: "physical", title: "Mug", slug: "mug", status: "published", price_cents: 4978, thumbnail_url: "https://cdn.example.com/m.jpg" }, {})
  const staleVariants = await j.call(`PUT /api/physical/products/${mug.id}`, { as: seller, body: { variants: [{ options: [], priceCents: 1000 }], formCurrency: "EUR" } })
  check("a shipped product's options saved from an editor opened in euros are refused", staleVariants.status === 409 && staleVariants.json?.error === CURRENCY_CHANGED && row("products", mug.id).price_cents === 4978, { status: staleVariants.status, body: staleVariants.json })
  const editor = src("app/app/products/new/product-editor.tsx")
  check("the product editor asks the store's currency first and refuses a save loaded in another", /fetch\("\/api\/store\/currency\?only=currency"/.test(editor) && /if \(currencyChangedSince\(loadedCurrency, now\?\.currency \?\? null\)\)/.test(editor))
  check("  says so the moment Settings changes it", /window\.addEventListener\(STORE_CURRENCY_EVENT, on\)/.test(editor) && /Your store currency changed\. Reload to see the converted prices\./.test(editor))
  check("  and is mounted again on the converted prices when nothing is unsaved", /export function ProductEditorAcrossCurrency/.test(editor) && /!dirty\.current\) setShown/.test(editor) && /<ProductEditorAcrossCurrency key=\{id\}/.test(src("app/app/products/[id]/page.tsx")))
  check("offers, coupons and shipped product options send the currency they were loaded in, kept while open", /const \[currency\] = React\.useState\(currencyNow\)/.test(src("app/app/offers/offer-editor.tsx")) && /formCurrency: currency/.test(src("app/app/offers/offer-editor.tsx")) && /const \[currency\] = useState\(currencyNow\)/.test(src("app/app/coupons/coupon-editor.tsx")) && /formCurrency: currency/.test(src("app/app/coupons/coupon-editor.tsx")) && /const \[formCurrency\] = React\.useState\(currency\)/.test(src("components/physical/product-cards.tsx")) && /variants,\s*formCurrency,/.test(src("components/physical/product-cards.tsx")))

  section("3c. A website cart saved before the change is priced again, not relabelled")
  const euroLine: CartLine = { productId: ebook.id as string, variantId: null, title: "Ebook", variantName: null, priceCents: 1000, thumbnailUrl: null, slug: "ebook", digital: true, quantity: 1, currency: "EUR" }
  const oldLine = { ...euroLine, currency: undefined }
  check("a line keeps the currency it was priced in through storage", parseCart(serializeCart([euroLine]))[0]?.currency === "EUR" && parseCart(JSON.stringify([{ ...euroLine, currency: "ron" }]))[0]?.currency === "RON")
  check("a line in another currency, or saved before lines said one, is priced again; one in the store's is not", cartNeedsReprice([euroLine], "RON") && cartNeedsReprice(parseCart(JSON.stringify([oldLine])), "RON") && !cartNeedsReprice([{ ...euroLine, currency: "RON" }], "RON") && !cartNeedsReprice([euroLine], null))
  const prices = await j.call("POST /api/cart/prices", { body: { shopId: creator.id, items: [{ productId: ebook.id, variantId: null }, { productId: club.id, variantId: null }, { productId: "00000000-0000-4000-8000-0000000000ff", variantId: null }] } })
  const priceOf = (id: unknown) => (prices.json?.lines ?? []).find((l: any) => l.productId === id)?.priceCents
  check("the server prices a saved cart again in the store's currency, with no session", prices.status === 200 && prices.json?.currency === "RON" && priceOf(ebook.id) === Math.round(1000 * rate), prices.json)
  check("  a product no longer for sale answers nothing to buy", priceOf("00000000-0000-4000-8000-0000000000ff") === null)
  const otherShop = await j.call("POST /api/cart/prices", { body: { shopId: "00000000-0000-4000-8000-0000000000aa", items: [{ productId: ebook.id, variantId: null }] } })
  check("  and never prices another store's product", otherShop.status === 200 && otherShop.json?.lines?.[0]?.priceCents === null, otherShop.json)
  const named = { ...euroLine, productId: "p2", customPriceCents: 700 }
  const repriced = repricedLines([euroLine, named, { ...euroLine, productId: "gone" }], [{ productId: euroLine.productId, variantId: null, priceCents: Math.round(1000 * rate) }, { productId: "p2", variantId: null, priceCents: 300 }, { productId: "gone", variantId: null, priceCents: null }], "RON")
  check("repriced: the new price and currency, a pay what you want amount named in euros dropped to the minimum, a gone product removed", repriced.length === 2 && repriced[0].priceCents === Math.round(1000 * rate) && repriced[0].currency === "RON" && repriced[1].priceCents === 300 && repriced[1].customPriceCents === undefined)
  const cart = src("components/website-builder/site-cart.tsx")
  check("the website's cart asks once when a saved line is in another currency, and stamps what it adds", /cartNeedsReprice\(kept, storeCurrency\)/.test(cart) && /fetch\("\/api\/cart\/prices"/.test(cart) && /repricedLines\(now, priced, at\)/.test(cart) && /\{ \.\.\.line, currency: storeCurrency \}/.test(cart))
  check("  told the store's currency by the page", /<SiteCartProvider [^>]*currency=\{storefront\?\.currency\}/.test(src("components/website-builder/theme/ThemePage.tsx")))

  section("4. Orders keep their currency; totals are never added cent for cent")
  const ord = (id: string, at: number, cents: number, currency: string) =>
    j.db.insert("orders", { id, creator_id: creator.id, product_id: ebook.id, amount_cents: cents, currency, status: "completed", created_at: new Date(at).toISOString(), stripe_session_id: `cs_${id}`, buyer_email: `${id}@example.com` }, {})
  ord("00000000-0000-4000-8000-000000000001", now - 2 * DAY, 1000, "eur")
  ord("00000000-0000-4000-8000-000000000002", now - 60_000, 5000, "ron")
  /* A day with no rate within a week: its money is left out, never guessed. */
  ord("00000000-0000-4000-8000-000000000003", now - 40 * DAY, 777, "gbp")
  const listing = await readOrdersListing(createAdminClient() as never, creator.id as string, { query: DEFAULT_QUERY, window: { start: now - 60 * DAY, end: now + 60_000 }, previous: null, timeZone: "UTC" })
  const fig = (k: string) => listing.metrics.find((m) => m.key === k)?.value
  check("the figures are in the store's currency", listing.summary.currency === "RON", listing.summary.currency)
  check("sales: the lei order as it is, the euro order at its day's rate, the pound order left out", fig("sales") === 5000 + Math.round(1000 * RON_PER_EUR), { sales: fig("sales"), want: 5000 + Math.round(1000 * RON_PER_EUR) })
  check("orders and customers still count every order", fig("orders") === 3 && fig("customers") === 3, { orders: fig("orders"), customers: fig("customers") })
  check("each order keeps the currency it was charged in", j.rows("orders").filter((o) => o.creator_id === creator.id).map((o) => o.currency).sort().join() === "eur,gbp,ron")
  const empty = await readOrdersListing(createAdminClient() as never, creator.id as string, { query: DEFAULT_QUERY, window: { start: now + DAY, end: now + 2 * DAY }, previous: null, timeZone: "UTC" })
  check("a period with no orders is still in lei, not \"$0.00\"", empty.summary.currency === "RON", empty.summary.currency)

  j.db.insert("commerce_checkouts", { creator_id: creator.id, status: "paid", currency: "EUR", total_cents: 1000, refunded_cents: 0, shipping_cents: 200, tax_cents: 0, lines: [{ type: "physical", product_id: ebook.id, title: "Mug", quantity: 1, unit_cents: 800 }], paid_at: new Date(now - 2 * DAY).toISOString(), created_at: new Date(now - 2 * DAY).toISOString() }, {})
  j.db.insert("commerce_checkouts", { creator_id: creator.id, status: "paid", currency: "RON", total_cents: 2000, refunded_cents: 0, shipping_cents: 0, tax_cents: 0, lines: [{ type: "physical", product_id: ebook.id, title: "Mug", quantity: 1, unit_cents: 2000 }], paid_at: new Date(now - 60_000).toISOString(), created_at: new Date(now - 60_000).toISOString() }, {})
  const phys = await physicalAnalytics(createAdminClient() as never, creator.id as string, new Date(now - 30 * DAY).toISOString())
  check("the shipped orders card counts in lei, each checkout at its day's rate", phys.currency === "RON" && phys.revenueCents === 2000 + Math.round(1000 * RON_PER_EUR), { currency: phys.currency, revenue: phys.revenueCents })
  check("  and its product's revenue too", phys.topProducts[0]?.revenueCents === 2000 + Math.round(800 * RON_PER_EUR), phys.topProducts)

  section("5. The sales breakdown: a list price converts with the line")
  const line = { created_at: new Date(now - 2 * DAY).toISOString(), currency: "eur", amount_cents: 1000, unit_price_cents: 1000, quantity: 1, status: "completed" }
  const conv = inReportingCurrency([line], "RON", [{ asOf: day(now - 2 * DAY), rates: { RON: RON_PER_EUR } }])
  const b = lineBreakdown(conv.rows[0] as never)
  check("a euro line in a lei store shows no discount it never had", conv.converted === 1 && b.discounts === 0 && b.gross === b.total, b)

  section("6. More currencies, the move itself")
  const market = [{ id: "home", primary: true, currency: null }, { id: "uk", currency: "GBP", rate: 0.85 }, { id: "us", currency: "USD" }, { id: "ro", currency: "RON", rate: 0.2 }]
  const converted = marketsForNewBase(market, { from: "EUR", to: "RON", mode: "convert", rate: 5 })
  const kept = marketsForNewBase(market, { from: "EUR", to: "RON", mode: "keep", rate: null })
  const back = marketsForNewBase(converted.markets, { from: "RON", to: "EUR", mode: "convert", rate: 1 / 5 })
  const at = (list: unknown[], id: string) => (list as Record<string, unknown>[]).find((m) => m.id === id)
  check("convert: a market's own rate is divided by the change's", at(converted.markets, "uk")?.rate === 0.17 && converted.changed)
  check("keep: the old rate says nothing about the new currency, so it is dropped", !("rate" in (at(kept.markets, "uk") ?? {})) && kept.changed)
  check("a market in the new base currency needs no rate", !("rate" in (at(converted.markets, "ro") ?? {})))
  check("a market without its own rate is left alone", at(converted.markets, "us")?.rate === undefined && at(converted.markets, "home")?.primary === true)
  check("Undo puts the rate back at the inverse", at(back.markets, "uk")?.rate === 0.85)

  section("7. Labels in the store's currency")
  check("the chart's money axis keeps dollars as they were", compactMoney(300000) === "$3k" && compactMoney(95000) === "$950" && compactMoney(250, 50) === "$2.50")
  check("and writes euros and lei in their own marks", compactMoney(120000, 100, "EUR") === "€1.2k" && /^1\.2k \S+$/.test(compactMoney(120000, 100, "RON")) && !compactMoney(120000, 100, "RON").includes("$"), [compactMoney(120000, 100, "EUR"), compactMoney(120000, 100, "RON")])
  const revenueGoal = challenges(NO_FACTS, "RON").find((c) => c.id === "revenue")
  check("Home's revenue goal is said in lei for a lei store", !!revenueGoal && !revenueGoal.label.includes("$") && /1,000/.test(revenueGoal.label), revenueGoal?.label)
  check("  and in dollars for a dollar store", challenges(NO_FACTS).find((c) => c.id === "revenue")?.label === "Make $1,000 in sales")
  const under = baseFor({ pay_what_you_want: true, pwyw_min_price_cents: 2500 }, 100, "RON")
  check("a pay what you want minimum is refused in the store's currency", under.ok === false && !under.error.includes("$") && /25\.00/.test(under.error), under)
  check("  and in dollars by default, as before", (baseFor({ pay_what_you_want: true, pwyw_min_price_cents: 500 }, 400) as { error: string }).error === "The lowest price is $5.00.")
  const reading = (key: string, value: number): MetricReading => ({ key: key as MetricReading["key"], value, previous: 0, series: [], previousSeries: [], change: null })
  const merged = moneyFrom(METRICS.map((m) => reading(m.key, 10)), METRICS.map((m) => reading(m.key, 1)))
  check("Orders' figures: money from the converted orders, counts from all of them", merged.every((r) => r.value === (METRICS.find((m) => m.key === r.key)?.money ? 1 : 10)))

  section("8. The open app follows a change without a reload, and after navigating")
  const card = src("components/app/settings/country-currency.tsx")
  check("Settings tells the app, refreshes the router's kept pages and its own kept reads", /dispatchEvent\(new CustomEvent\(STORE_CURRENCY_EVENT/.test(card) && /rereadKept\(\)/.test(card) && /router\.refresh\(\)/.test(card))
  check("rereadKept reads every kept answer again", /export function rereadKept\(\)[\s\S]{0,120}for \(const path of \[\.\.\.kept\.keys\(\)\]\) void keep\(path\)/.test(src("components/physical/ui.tsx")))
  const taxes = src("components/app/settings/taxes-panel.tsx")
  check("Taxes reads the store currency with its other hooks, before any early return", taxes.indexOf("useStoreCurrencyIfSet()") > 0 && taxes.indexOf("useStoreCurrencyIfSet()") < taxes.indexOf("if (!setup) {"))
  check("the shipped orders card asks again when the currency changes", /\[enabled, query, storeCurrency\]/.test(src("components/physical/analytics-card.tsx")))
  check("the chart axis is written in the store's currency", /useStoreCurrency\(\)/.test(src("components/app/analytics-chart.tsx")) && /compactMoney\(v, step, currency\)/.test(src("components/app/analytics-chart.tsx")))
  check("a smart collection's price rule shows the store's mark, in its field and its summary", /useMoneyMark\(/.test(src("app/app/products/collections/collection-editor.tsx")) && !/>\$<\/span>/.test(src("app/app/products/collections/collection-editor.tsx")) && /howWords\(c, storeCurrency\)/.test(src("app/app/products/collections/collections-client.tsx")))
  check("Offers and Collections take the refreshed list, as Coupons does", /if \(seen !== initialOffers\)/.test(src("app/app/offers/offers-client.tsx")) && /if \(seen !== initialCollections\)/.test(src("app/app/products/collections/collections-client.tsx")))
  check("/app search writes a plan's price in dollars", /productPriceCurrency\(p, currency\)/.test(src("lib/search/app-search.ts")) && /price_cents, type/.test(src("lib/search/app-search.ts")))
  const paged = src("lib/orders/paged.ts")
  check("Orders' figures no longer fall back to adding every currency's cents", !/asCharged/.test(paged) && /moneyFrom\(read\(orders\), read\(money\)\)/.test(paged))

  section("9. SQL part 258")
  const part = "supabase/sql/run-now/258_store_currency_plans_offers_collections.sql"
  const sql = existsSync(part) ? raw(part) : ""
  check("part 258 is in run-now, with the same migration", sql.length > 0 && raw("supabase/migrations/20270205_store_currency_plans_offers_collections.sql") === sql)
  check("plans are left out of products and their options", /'creator_id = \$1 AND coalesce\(type, ''''\) NOT IN \(''membership'', ''community''\)'/.test(sql) && /p\.creator_id = \$1 AND coalesce\(p\.type, ''''\) NOT IN/.test(sql))
  check("offers and smart collections are converted and restorable", /\('store_offers', 'id', 'creator_id = \$1', ARRAY\['min_subtotal_cents'\]\)/.test(sql) && /'product_collections'/.test(sql) && /WHEN 'rules' THEN 'rules = s\.before->''rules'''/.test(sql))
  check("server only, like 176", /REVOKE ALL ON FUNCTION public\.store_change_currency/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.store_currency_restore\(uuid, uuid\) TO service_role/.test(sql))
  check("99_check_after reads it", /as p258_store_currency_plans_offers_collections/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("the bundles carry it", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(sql.split("\n")[1]) && raw("supabase/sql/all-in-two/1_of_2_everything.sql").includes(sql.split("\n")[1]))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

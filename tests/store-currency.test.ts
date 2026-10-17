/**
 * ===========================================================================
 *  A STORE SELLS IN ITS OWN CURRENCY
 * ===========================================================================
 * The bug this pins: a store priced in lei showed lei on its website and was
 * charged in dollars at checkout, with a note saying the lei were an
 * estimate. Each store now has one selling currency (store_settings.currency,
 * SQL part 176); its website shows it and its three website checkouts charge
 * it, amount for amount. What has to hold:
 *
 *   RULES      which currencies a store can sell in, the suggested one for a
 *              country, Stripe's smallest charge in each, the day's rate
 *   QUOTE      a RON store's basket is held to Stripe's RON minimum and
 *              written in lei; a store that never chose sells as before
 *   CHARGE     every website checkout charges the store's currency, never
 *              the platform's, and keeps no "estimate" note for it
 *   LEDGER     a sale in another currency is converted once into the
 *              wallet's, so the wallet never adds lei to dollars
 *   CHANGE     the settings card and its route ask keep or convert, show the
 *              rate with its day, and change everything in one transaction
 *   SQL        part 176 is additive, server only, idempotent and restorable
 */
import { readFileSync } from "node:fs"
import {
  COUNTRY_CURRENCY,
  SELLING_CURRENCIES,
  STRIPE_MINIMUM_MINOR,
  canSellIn,
  minimumChargeMinor,
  sellingCurrencyOf,
  suggestedCurrencyFor,
  unsupportedLocalCurrency,
} from "@/lib/store/selling-currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { exchangeRate, chargeNote } from "@/lib/markets/money"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { STORELIB_CURRENCY } from "@/lib/pricing/surface-currency"
import { basketDecision } from "@/lib/checkout/basket-decision"
import { siteQuote } from "@/lib/checkout/site-quote-server"
import { stripComments } from "./_source"
import { listPrice } from "@/lib/pricing/list-price"
import { storeCurrencies } from "@/lib/store/store-currencies"
import { formatPlatformMoney } from "@/lib/i18n/currency"

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

const SHOP = "11111111-1111-4111-8111-111111111111"
const A = "00000001-2222-4222-8222-222222222222"

/** Tables answering select/eq/in/order/limit/maybeSingle and a plain await (the pricing reads). */
function pricingDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        ilike: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}
const product = (price: number) => ({
  id: A,
  title: "Print",
  slug: "print",
  price_cents: price,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  thumbnail_url: null,
  type: "digital",
  status: "published",
  creator_id: SHOP,
})

async function main() {
  process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = "usd"
  process.env.PHYSICAL_COMMERCE_ENABLED = "0"

  console.log("\nWhich currencies a store can sell in")
  {
    check("the six Storelib can charge, each with a Stripe minimum", SELLING_CURRENCIES.join() === "USD,EUR,GBP,RON,CAD,AUD" && SELLING_CURRENCIES.every((c) => STRIPE_MINIMUM_MINOR[c] > 0))
    check("RON, lower case or padded, is accepted", canSellIn(" ron ").ok && (canSellIn("ron") as { currency: string }).currency === "RON")
    const pln = canSellIn("PLN")
    check("PLN is refused with the list it can choose from, before anything is saved", pln.ok === false && /aren't available/.test(pln.reason) && /RON/.test(pln.reason))
    check("JPY has no cents and is refused", canSellIn("JPY").ok === false)
    check("nonsense is refused", canSellIn("lei").ok === false && canSellIn(null).ok === false)
    check("a store that never chose sells in the platform currency, as before", sellingCurrencyOf(null) === "USD" && sellingCurrencyOf("XYZ") === "USD")
    check("a store that chose RON sells in RON", sellingCurrencyOf("RON") === "RON")
  }

  console.log("\nThe suggestion comes from where the store is based")
  {
    check("Romania suggests RON, France EUR, the UK GBP", suggestedCurrencyFor("RO") === "RON" && suggestedCurrencyFor("fr") === "EUR" && suggestedCurrencyFor("GB") === "GBP")
    check("Poland suggests the platform's, and says PLN can't be charged yet", suggestedCurrencyFor("PL") === "USD" && unsupportedLocalCurrency("PL") === "PLN")
    check("a country Storelib can charge has no unsupported note", unsupportedLocalCurrency("RO") === null)
    check("every country's currency is a real code", Object.values(COUNTRY_CURRENCY).every((c) => /^[A-Z]{3}$/.test(c)))
    const card = code("components/app/settings/country-currency.tsx")
    check("the settings card never reads the buyer's location: only the merchant's country and the request's own country", !/navigator\.language|geolocation|sl_country/.test(card))
  }

  console.log("\nStripe's smallest charge is the store currency's")
  {
    check("2 lei in RON, 50 cents in USD and EUR, 30 pence in GBP", minimumChargeMinor("RON") === 200 && minimumChargeMinor("USD") === 50 && minimumChargeMinor("EUR") === 50 && minimumChargeMinor("GBP") === 30)
    check("lei are written as lei", /lei|RON/.test(shopMoneyIn(4900, "RON")) && /49/.test(shopMoneyIn(4900, "RON")), shopMoneyIn(4900, "RON"))
    check("pounds as pounds, euros as euros", shopMoneyIn(1250, "GBP").includes("£") && shopMoneyIn(1250, "EUR").includes("€"))
  }

  console.log("\nThe day's rate a change converts at")
  {
    const today = Date.parse("2026-10-14T10:00:00Z")
    const fx = { asOf: "2026-10-13", rates: { USD: 1.08, RON: 4.977312, GBP: 0.86 } }
    check("EUR to RON is the euro rate itself", exchangeRate(fx, "EUR", "RON", today) === 4.977312)
    check("USD to RON goes through the euro, six decimals", exchangeRate(fx, "USD", "RON", today) === Math.round((4.977312 / 1.08) * 1e6) / 1e6)
    check("the same currency is 1, without rates", exchangeRate(null, "RON", "RON") === 1)
    check("stale rates give no rate rather than an old one", exchangeRate({ ...fx, asOf: "2026-09-01" }, "USD", "RON", today) === null)
    check("a currency with no rate gives none", exchangeRate(fx, "USD", "CAD", today) === null)
  }

  console.log("\nA RON store's basket is quoted in lei")
  {
    const ron = pricingDb({ products: [product(150)], coupons: [], store_settings: [{ creator_id: SHOP, currency: "RON", default_country: "RO" }] })
    const usd = pricingDb({ products: [product(150)], coupons: [], store_settings: [{ creator_id: SHOP, currency: null, default_country: "US" }] })
    const store = await readStoreCurrency(ron, SHOP)
    check("the store's currency is read from its settings", store.currency === "RON" && store.chosen === "RON" && store.country === "RO" && store.ready, store)
    const before = await readStoreCurrency(usd, SHOP)
    check("a store that never chose sells in the platform's, and can still choose", before.currency === "USD" && before.chosen === null && before.ready, before)
    const missing = {
      from: () => {
        const chain: Record<string, unknown> = { select: (cols: string) => ((chain.cols = cols), chain), eq: () => chain, maybeSingle: async () => (String(chain.cols).includes("currency") ? { data: null, error: { code: "42703" } } : { data: { default_country: "RO" }, error: null }) }
        return chain
      },
    }
    const old = await readStoreCurrency(missing, SHOP)
    check("before SQL part 176 the store keeps selling as before, and the setting says it waits", old.currency === "USD" && !old.ready && old.country === "RO", old)

    const q = await siteQuote(ron, SHOP, { items: [{ productId: A }] })
    check("1.50 lei is under Stripe's 2 lei minimum and is refused in lei", q.ok === false && /2[.,]00/.test(q.error) && /lei|RON/.test(q.error), q)
    const fine = await siteQuote(usd, SHOP, { items: [{ productId: A }] })
    check("the same 150 in a dollar store is over 50 cents and is quoted", fine.ok === true, fine)
    const priced = { ok: true, lines: [{ item: { productId: A, priceCents: 150 }, product: { type: "digital", creator_id: SHOP } }], creatorIds: [SHOP], ships: [], totalCents: 150, dropped: [], owned: [] }
    const decided = basketDecision(priced as never, { shopId: SHOP, currency: "RON" })
    check("the basket decision holds a RON basket to the RON minimum", decided.kind === "refuse", decided)
    check("and lets the same 150 through in dollars", basketDecision(priced as never, { shopId: SHOP, currency: "USD" }).kind === "pay")
  }

  console.log("\nEvery website checkout charges the store's currency")
  {
    const site = code("app/api/checkout/site/route.ts")
    const cart = code("app/api/checkout/cart/route.ts")
    const physical = code("lib/physical/checkout-server.ts")
    for (const [name, src] of [["the website checkout", site], ["the basket checkout", cart], ["the shipped checkout", physical]] as const) {
      /* Changed on purpose (checkout, currency and translation overhaul): the website checkout reads it through its market (lib/markets/checkout-market-server), the store's currency or the market's it can charge. */
      const viaMarket = /checkoutMarket\(site\.creatorId, countryOfRequest\(request\), admin\)/.test(src) && /const chargeCurrency = chargeCurrencyUpper\.toLowerCase\(\)/.test(src)
      check(`${name} reads the store's currency and charges it`, viaMarket || (/readStoreCurrency\(/.test(src) && /chargeCurrency = storeCurrency\.toLowerCase\(\)/.test(src)))
      check(`${name} holds it to that currency's Stripe minimum`, (/minimumChargeMinor\(storeCurrency\)/.test(src) || /minimumChargeMinor\(chargeCurrencyUpper\)/.test(src)) && !/MIN_CHARGE_CENTS/.test(src))
      check(`${name} charges no platform currency`, !/platformChargeCurrency\(/.test(src))
    }
    check("a checkout started in one currency is never reused for another", /pi\.currency/.test(physical))
    const page = code("app/checkout/site/page.tsx")
    check("the checkout page draws its amounts in the store's currency", /* Changed on purpose (checkout, currency and translation overhaul): the currency it is charged in: the store's, or the visitor's market's. */ /<CheckoutCurrency currency=\{market\.chargeCurrency\}/.test(page))
    check("and only notes a charge currency when a visitor's market shows another", /chargeNote\(/.test(page) && chargeNote("RON", "RON") === null)
    const pay = code("app/checkout/parts/stripe-pay.tsx")
    check("the card form is set up in the charge's currency", /chargeCurrency/.test(pay))
  }

  console.log("\nThe wallet keeps one currency")
  {
    const fulfil = code("lib/checkout/fulfil-payment.ts")
    check("a sale is converted into the wallet's currency once, at the day's rate", /toLedger\(/.test(fulfil))
    const refunds = code("lib/stripe/refund-sync.ts")
    check("so is a refund of it", /toLedger\(/.test(refunds) || /ledgerAmount/.test(refunds))
    const ledger = code("lib/payments/ledger-currency.ts")
    check("the wallet's currency is the platform's", /platformChargeCurrency\(\)/.test(ledger))
  }

  console.log("\nChanging the currency")
  {
    const route = code("app/api/store/currency/route.ts")
    check("the route says what a change does before it is made", /export async function POST/.test(route) && /examples/.test(route) && /asOf/.test(route))
    check("converting uses only the rate the merchant was shown", /Number\(body\.rate\) !== now\.rate/.test(route) && /409/.test(route))
    check("a store with prices must choose keep or convert", /mode !== "keep" && mode !== "convert"/.test(route))
    check("the change is one database transaction, once per key", /rpc\("store_change_currency"/.test(route) && /p_key: key/.test(route))
    check("a change made somewhere else since is refused, not overwritten", /40001/.test(route))
    check("every page showing a price is refreshed", /revalidateTag\(storeCurrencyTag/.test(route) && /revalidatePublishedSite/.test(route))
    const card = code("components/app/settings/country-currency.tsx")
    check("the card reads Store currency and Selling in", /* Changed on purpose (the owner: one currency, set in Languages & Currency; free open translation). */ /tt\("Store currency"\)/.test(card) && /tt\("Selling in"\)/.test(card))
    check("Save waits until keep or convert is chosen", /asks && !mode/.test(card) && /useState<"keep" \| "convert" \| null>\(null\)/.test(card))
    check("the rate is shown with its day", /Rate: 1 \{from\} = \{rate\} \{to\}, \{day\}/.test(card))
    const panel = code("components/app/settings/store-details-panel.tsx")
    check("Store details shows it in place of the old Based in row, linking to where it is set", /* Changed on purpose (the owner: one currency, set in Languages & Currency; free open translation). */ /<CurrencyLink \/>/.test(panel) && /href="\/app\/settings\?tab=markets"/.test(card) && !/function BasedIn/.test(panel))
  }

  console.log("\nA card is drawn in the currency its surface says, and the storefront's is the store's")
  {
    const lei = listPrice({ price_cents: 4900, currency: "RON" })
    check("a lei store's card says lei, never dollars", /lei|RON/.test(lei.main) && !/\$/.test(lei.main), lei)
    const plain = listPrice({ price_cents: 4900 })
    /* Changed on purpose (the owner: a store's currency must not reach Storelib's own
       pages). A card nobody told is Storelib's currency, not the deployment's charge
       currency: tests/surface-currency.test.ts holds that whole boundary. */
    check("a card with no currency is Storelib's own, whatever any store sells in", plain.main === listPrice({ price_cents: 4900 }, (c) => shopMoneyIn(c, STORELIB_CURRENCY, { grouping: true })).main && plain.main === "$49.00", plain)
    const db = { from: () => ({ select: () => ({ in: async () => ({ data: [{ creator_id: "a", currency: "RON" }, { creator_id: "b", currency: null }], error: null }) }) }) }
    const map = await storeCurrencies(db, ["a", "b", "c", null])
    check("many stores' currencies in one read; a store that never chose or has no row sells in the platform's", map.get("a") === "RON" && map.get("b") === "USD" && map.get("c") === "USD" && map.size === 3, [...map])
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "42703" } }) }) }) }
    check("before SQL part 176 every store is the platform's", (await storeCurrencies(broken, ["a"])).get("a") === "USD")
    check("the marketplace's lei display reads a lei price as lei, not as dollars to convert", formatPlatformMoney(4900, "RON") === formatPlatformMoney(4900, "ron") && /49/.test(formatPlatformMoney(4900, "RON")), formatPlatformMoney(4900, "RON"))
    check("and a euro price through the same table", /50/.test(formatPlatformMoney(1000, "EUR")), formatPlatformMoney(1000, "EUR"))
    const session = code("app/api/checkout/stripe-session/route.ts")
    /* Changed on purpose (the owner: a store's currency must not reach Storelib's own
       checkout). The single product checkout charges the currency of the SURFACE it is
       served on: the store's own when the store's website is serving it, Storelib's on
       storelib.com. Still one read, still held to that currency's Stripe minimum, still
       no platform charge currency. tests/surface-currency.test.ts drives both hosts. */
    check("the single product checkout charges its surface's currency, held to that currency's minimum", /checkoutSurfaceCurrency\(admin, \{ host: request\.headers\.get\("host"\), creatorId: creator\.id \}\)/.test(session) && /const chargeCurrency = surface\.charge/.test(session) && /minimumChargeMinor\(surfaceCurrencyCode\)/.test(session) && !/platformChargeCurrency\(/.test(session))
    const page = code("app/checkout/page.tsx")
    check("and its page draws that same surface's currency, decided the same way", /<CheckoutCurrency currency=\{store\.currency\}>/.test(page) && /checkoutSurfaceCurrency\(checkoutAdmin\(\), \{ host: requestHost, creatorId: creator\?\.id \?\? null \}\)/.test(page))
    const boundary = code("lib/pricing/surface-currency-server.ts")
    check("and that decision reads the host from the database, never from the page", /siteOfHost\(db, opts\.host\)/.test(boundary) && /readStoreCurrency\(db, opts\.creatorId\)/.test(boundary))
    const client = code("app/checkout/checkout-client.tsx")
    check("its own minimum check is the store currency's", /minimumChargeMinor\(chargeCurrency\)/.test(client) && !/MIN_CHARGE_CENTS/.test(client))
    /* Changed on purpose (the owner: a store's currency must not reach Storelib's own
       pages). Every page of storelib.com says STORELIB_CURRENCY, and a product page
       reads the store's only for a thing that ships, whose one checkout charges it.
       tests/surface-currency.test.ts holds each of these and proves the leak fails them. */
    for (const f of ["app/(marketing)/u/[username]/layout.tsx", "app/(marketing)/l/[slug]/page.tsx", "app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx"]) {
      const src = code(f)
      check(`${f.split("/").slice(1, 3).join("/")} tells its prices Storelib's currency, not a store's`, /STORELIB_CURRENCY/.test(src) && !/storeCurrencies|cachedStoreCurrency|readStoreCurrency/.test(src))
    }
    const product = code("app/(marketing)/p/[slug]/layout.tsx")
    check("(marketing)/p is Storelib's too, and reads the store's currency only for a thing that ships", /<PriceCurrency currency=\{shipsIn \?\? STORELIB_CURRENCY\}>/.test(product) && /ships \? cachedStoreCurrency\(/.test(product))
    for (const f of ["components/product/product-price-card.tsx", "components/product/variant-selector.tsx", "components/checkout/purchase-status-wrapper.tsx", "components/checkout/buy-button.tsx", "components/checkout/smart-buy-button.tsx", "components/store-builder/sticky-product-bar.tsx", "components/onepage/public-onepage.tsx"]) {
      check(`${f.split("/").pop()} prices in the page's currency`, /usePageMoney\(\)/.test(code(f)) && !/(?<![\w.])shopMoney\(/.test(code(f)))
    }
    check("the creator page's sections too", /usePriceCurrency\(\)/.test(code("components/store-builder/unified-section-renderer.tsx")) && !/(?<![\w.])shopMoney\(/.test(code("components/store-builder/unified-section-renderer.tsx")))
    check("the locale's formatPrice follows the page's currency", /formatPlatformMoney\(cents, from\)/.test(code("components/locale-provider.tsx")))
  }

  console.log("\nA sale's wallet line and invoice are in what it was charged in")
  {
    const fulfil = code("lib/checkout/fulfil-payment.ts")
    check("the wallet converts a product sale from its own currency", /destinationPaymentId: facts\.destinationPaymentId, currency: row\.currency \}/.test(fulfil))
    check("so does one refunded for being over its limit", /destinationPaymentId: o\.destinationPaymentId, currency: paid\.currency \}/.test(fulfil))
    check("the invoice is in the order's currency, never a fixed dollar", /currency: row\.currency,/.test(fulfil) && !/currency: "usd",\n\s*buyer_email/.test(fulfil))
  }

  console.log("\nUndo")
  {
    const route = code("app/api/store/currency/route.ts")
    check("the latest change can be undone for a day, through the database's own restore", /export async function PATCH/.test(route) && /rpc\("store_currency_restore"/.test(route) && /UNDO_HOURS = 24/.test(route))
    check("only the latest change, and only while it is still the store's", /latest\.id !== id/.test(route) && /lastChange\.to === store\.currency/.test(route))
    const card = code("components/app/settings/country-currency.tsx")
    check("the card asks before undoing, and says prices edited since go back too", /Prices you changed since then go back too/.test(card) && /setAsking\(true\)/.test(card))
  }

  console.log("\nSQL part 176")
  {
    const sql = read("supabase/sql/run-now/176_store_currency.sql")
    const mig = read("supabase/migrations/20270116_store_currency.sql")
    check("the migration and the run-now part are the same file", sql === mig)
    check("only adds: a column, two tables, three functions", /ADD COLUMN IF NOT EXISTS currency/i.test(sql) && !/DROP TABLE|DROP COLUMN/i.test(sql))
    check("the history tables are server only", /REVOKE ALL ON (TABLE )?public\.store_currency_changes FROM anon, authenticated/i.test(sql) || /revoke all on (table )?public\.store_currency_changes from anon, authenticated/i.test(sql))
    check("the change is idempotent per key", /UNIQUE \(creator_id, request_key\)/i.test(sql))
    check("it refuses when the store's currency moved underneath it", /40001/.test(sql))
    check("every value is kept before it is changed, for a restore", /store_currency_snapshots/.test(sql) && /store_currency_restore/.test(sql))
    const one = read("supabase/sql/store-currency-cod-languages/1_run.sql")
    const parts = ["174_cash_on_delivery.sql", "175_automatic_translation.sql", "176_store_currency.sql"]
    check("the one file holds parts 174 to 176 as they are (python3 scripts/build-currency-cod-languages-sql.py)", parts.every((f) => read(`supabase/sql/run-now/${f}`).split("\n").filter((l) => l.trim() && l.trim() !== "notify pgrst, 'reload schema';").every((l) => one.includes(l))))
    check("its rollback puts prices back before anything is dropped, and says what can't be undone", /store_currency_restore/.test(read("supabase/sql/store-currency-cod-languages/3_rollback.sql")) && /IRREVERSIBLE/.test(read("supabase/sql/store-currency-cod-languages/3_rollback.sql")))
    check("only the server can run it", /GRANT EXECUTE ON FUNCTION public\.store_change_currency\([^)]*\) TO service_role/i.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

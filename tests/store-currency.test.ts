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
import { basketDecision } from "@/lib/checkout/basket-decision"
import { siteQuote } from "@/lib/checkout/site-quote-server"
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
      check(`${name} reads the store's currency and charges it`, /readStoreCurrency\(/.test(src) && /chargeCurrency = storeCurrency\.toLowerCase\(\)/.test(src))
      check(`${name} holds it to that currency's Stripe minimum`, /minimumChargeMinor\(storeCurrency\)/.test(src) && !/MIN_CHARGE_CENTS/.test(src))
      check(`${name} charges no platform currency`, !/platformChargeCurrency\(/.test(src))
    }
    check("a checkout started in one currency is never reused for another", /pi\.currency/.test(physical))
    const page = code("app/checkout/site/page.tsx")
    check("the checkout page draws its amounts in the store's currency", /<CheckoutCurrency currency=\{store\.currency\}/.test(page))
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
    check("the card reads Country & Currency and Selling in", /tt\("Country & Currency"\)/.test(card) && /tt\("Selling in"\)/.test(card))
    check("Save waits until keep or convert is chosen", /asks && !mode/.test(card) && /useState<"keep" \| "convert" \| null>\(null\)/.test(card))
    check("the rate is shown with its day", /Rate: 1 \{from\} = \{rate\} \{to\}, \{day\}/.test(card))
    const panel = code("components/app/settings/store-details-panel.tsx")
    check("Store details shows it in place of the old Based in row", /<CountryCurrency \/>/.test(panel) && !/function BasedIn/.test(panel))
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
    check("only the server can run it", /GRANT EXECUTE ON FUNCTION public\.store_change_currency\([^)]*\) TO service_role/i.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

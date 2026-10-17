/**
 * ===========================================================================
 *  A STORE'S CURRENCY STOPS AT ITS STOREFRONT
 * ===========================================================================
 * The bug this pins: a creator set their store to RON, and every price
 * Storelib itself shows for them moved with it. Their Explore cards, their
 * creator page, their product page, their OnePage and the currency
 * Storelib's own checkout charged all became lei, because each of those
 * surfaces read `store_settings.currency` as if it were the price's one
 * true currency.
 *
 * lib/pricing/surface-currency draws the line. What has to hold, for a
 * store whose configured currency is RON:
 *
 *   STOREFRONT   its website shows RON and its website checkout charges RON
 *   STORELIB     its creator page, its product page, its OnePage and
 *                Explore show USD, and Storelib's own checkout charges USD
 *   COMMUNITY    plan prices, tickets and programs are USD, and so is what
 *                their checkouts charge
 *   STABLE       changing the website currency moves no Storelib price
 *   HISTORY      an order keeps the currency it was made in, and the
 *                currency change touches no order, refund, invoice or payout
 *
 * THE ENVIRONMENT IS SET TO LEI ON PURPOSE (./_ron.ts, imported first). The
 * platform charge currency is what the leaky code read, so with it set to
 * lei every check below that expects dollars FAILS on the old behaviour.
 * The LEAK section says so in as many words and prints both answers.
 */
import "./_ron"

import { readFileSync } from "node:fs"
import { listPrice, usd } from "@/lib/pricing/list-price"
import { STORELIB_CHARGE_CURRENCY, STORELIB_CURRENCY, surfaceCurrency, surfaceOfHost } from "@/lib/pricing/surface-currency"
import { checkoutSurfaceCurrency } from "@/lib/pricing/surface-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { toCard } from "@/lib/website-builder/shop-products"
import { priceLine } from "@/lib/communities/format"
import { money, pricePer } from "@/lib/memberships/state"
import { eventCheckoutParams } from "@/lib/communities/server/event-checkout"
import { orderCurrency } from "@/lib/orders/money"
import { salesCurrencyOf } from "@/lib/payments/display-currency"
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

/** The RON store, and a store that never chose. */
const LEI = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const USER = "33333333-3333-4333-8333-333333333333"
const PRODUCT = "44444444-4444-4444-8444-444444444444"

/**
 * Tables answering select/eq/in/limit/maybeSingle and a plain await, as
 * tests/store-currency.test.ts does, so the real readers run against rows
 * rather than a mock of themselves.
 */
function db(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}

/** A world where leishop.storelib.com is the RON store's published website. */
const world = (currency: string | null) =>
  db({
    store_settings: [{ creator_id: LEI, currency, default_country: "RO" }, { creator_id: OTHER, currency: null, default_country: "US" }],
    profiles: [{ id: USER, username: "leishop" }],
    creators: [{ id: LEI, user_id: USER, slug: "leishop", banned_at: null }],
    store_theme_installs: [{ id: "install-1", creator_id: LEI, status: "published" }],
    site_deployments: [],
    website_addresses: [],
    website_address_history: [],
  })

const SITE_HOST = "leishop.storelib.com"
const PLATFORM_HOST = "storelib.com"

async function main() {
  console.log("\nThe environment the leaky code read")
  {
    check("the platform charge currency is lei here, so a dollar answer below can only come from the boundary", SHOP_CURRENCY === "RON", SHOP_CURRENCY)
    check("Storelib's own surfaces are dollars, and not from that environment", STORELIB_CURRENCY === "USD" && STORELIB_CHARGE_CURRENCY === "usd")
  }

  console.log("\nThe boundary itself")
  {
    check("a storefront is the store's currency", surfaceCurrency("storefront", "RON") === "RON")
    check("a storefront with no store currency read is Storelib's, as a store that never chose sells", surfaceCurrency("storefront", null) === "USD")
    for (const s of ["creator_page", "explore", "community", "platform"] as const) {
      check(`${s} is Storelib's currency even when handed RON`, surfaceCurrency(s, "RON") === STORELIB_CURRENCY)
    }
    check("the host decides: the creator's own website is their storefront", surfaceOfHost(LEI, LEI) === "storefront")
    check("another creator's website selling this product is not", surfaceOfHost(OTHER, LEI) === "platform")
    check("storelib.com, with no website host at all, is Storelib's", surfaceOfHost(null, LEI) === "platform")
  }

  console.log("\nA RON store's website shows RON and its checkout charges RON")
  {
    const store = await readStoreCurrency(world("RON"), LEI)
    check("the store's configured currency is read as RON", store.currency === "RON" && store.chosen === "RON", store)
    const card = toCard({ id: PRODUCT, title: "Print", slug: "print", price_cents: 4900, type: "digital", status: "published" } as never, [], [], store.currency)
    const websitePrice = card.settings.price as string
    check("its website card says lei", /lei|RON/.test(websitePrice) && !websitePrice.includes("$") && /49/.test(websitePrice), websitePrice)
    check("and the card carries that currency with it, so the cart and checkout read the same one", card.settings.currency === "RON", card.settings.currency)
    const site = await checkoutSurfaceCurrency(world("RON"), { host: SITE_HOST, creatorId: LEI })
    check("a checkout served on its own website host is the storefront, charging RON", site.surface === "storefront" && site.currency === "RON" && site.charge === "ron", site)
    check("and is held to Stripe's RON minimum, 2 lei", minimumChargeMinor(site.currency) === 200)
    check("the website checkout route reads the store's currency, not Storelib's", /readStoreCurrency\(/.test(code("app/api/checkout/site/route.ts")) || /checkoutMarket\(/.test(code("app/api/checkout/site/route.ts")))
    check("so does the basket checkout on a creator's own site", /readStoreCurrency\(/.test(code("app/api/checkout/cart/route.ts")))
    check("and the shipped checkout, whose shipping rates are in that currency", /readStoreCurrency\(/.test(code("lib/physical/checkout-server.ts")))
  }

  console.log("\nStorelib's creator pages show USD")
  {
    const u = code("app/(marketing)/u/[username]/layout.tsx")
    check("the creator page tells its prices Storelib's currency", /<PriceCurrency currency=\{STORELIB_CURRENCY\}>/.test(u))
    check("and never reads the store's currency to price itself", !/cachedStoreCurrency|readStoreCurrency|sellingCurrency/.test(u))
    const p = code("app/(marketing)/p/[slug]/layout.tsx")
    check("the product page tells its prices Storelib's currency", /<PriceCurrency currency=\{shipsIn \?\? STORELIB_CURRENCY\}>/.test(p))
    check("reading the store's currency only for a thing that ships, whose only checkout charges it", /type === "physical"/.test(p) && /ships \? cachedStoreCurrency\(/.test(p))
    const page = code("app/(marketing)/p/[slug]/page.tsx")
    check("the product page's own prices and its search engine offer are that same currency", /const pageCurrency = product\.type === "physical" \? await cachedStoreCurrency\(/.test(page) && /priceCurrency: pageCurrency,/.test(page))
    const l = code("app/(marketing)/l/[slug]/page.tsx")
    check("a OnePage too", /<PriceCurrency currency=\{STORELIB_CURRENCY\}>/.test(l) && !/cachedStoreCurrency/.test(l))
    check("a page that was told nothing falls back to Storelib's, never the deployment's", /useContext\(Ctx\) \?\? STORELIB_CURRENCY/.test(code("components/platform/price-currency.tsx")))
    const label = listPrice({ price_cents: 4900, currency: STORELIB_CURRENCY })
    check("a creator page's card says $49.00", label.main === "$49.00", label)
    check("a membership on it says $9.00/month", listPrice({ price_cents: 900, type: "membership", currency: STORELIB_CURRENCY }).main === "$9.00/month")
  }

  console.log("\nExplore shows USD")
  {
    for (const f of ["app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx"]) {
      const src = code(f)
      const name = f.replace("app/(marketing)/", "").replace("/page.tsx", "")
      check(`${name} gives every card Storelib's currency`, /currency: STORELIB_CURRENCY,/.test(src))
      check(`${name} reads no store currency for its cards`, !/storeCurrencies|cachedStoreCurrency|readStoreCurrency/.test(src))
    }
    check("a card nobody told is dollars", usd(125000) === "$1,250.00", usd(125000))
    const listed = listPrice({ price_cents: 4900, compare_at_cents: 9800 })
    check("with its compare-at price and saving in the same currency", listed.main === "$49.00" && listed.was === "$98.00" && listed.off === 50, listed)
    check("a pay what you want card too", listPrice({ pay_what_you_want: true, pwyw_min_price_cents: 500, price_cents: 500 }).main === "$5.00+")
  }

  console.log("\nStorelib's own checkout charges USD")
  {
    const platform = await checkoutSurfaceCurrency(world("RON"), { host: PLATFORM_HOST, creatorId: LEI })
    check("a RON store's product bought on storelib.com is charged in USD", platform.surface === "platform" && platform.currency === "USD" && platform.charge === "usd", platform)
    check("and held to Stripe's USD minimum, 50 cents", minimumChargeMinor(platform.currency) === 50)
    const unknown = await checkoutSurfaceCurrency(world("RON"), { host: "some-preview.vercel.app", creatorId: LEI })
    check("a host that is nobody's website is Storelib's, never a guessed store currency", unknown.charge === "usd", unknown)
    const session = code("app/api/checkout/stripe-session/route.ts")
    check("the route takes its charge currency from the surface", /checkoutSurfaceCurrency\(admin, \{ host: request\.headers\.get\("host"\), creatorId: creator\.id \}\)/.test(session) && /const chargeCurrency = surface\.charge/.test(session))
    check("one answer for the amount, the PaymentIntent and the wallet sheet", (session.match(/currency: chargeCurrency,/g) ?? []).length >= 2)
    check("and no second read of the store's currency beside it", !/readStoreCurrency/.test(session))
    const pageSrc = code("app/checkout/page.tsx")
    check("the checkout page draws the same surface's currency, decided the same way", /checkoutSurfaceCurrency\(checkoutAdmin\(\), \{ host: requestHost, creatorId: creator\?\.id \?\? null \}\)/.test(pageSrc) && /<CheckoutCurrency currency=\{store\.currency\}>/.test(pageSrc))
  }

  console.log("\nA community's prices and checkouts are USD")
  {
    const plan = priceLine({ kind: "paid", billing: "recurring", monthlyCents: 2400 })
    check("a plan with no currency of its own reads as dollars", plan === "$24/month", plan)
    check("a one off tier too, and one with cents", priceLine({ kind: "paid", billing: "one_time", priceCents: 1500 }) === "$15" && priceLine({ kind: "paid", billing: "one_time", priceCents: 1550 }) === "$15.50")
    check("and the membership presentation the member sees", money(2400) === "$24" && pricePer(2400, "month") === "$24/month")
    const plans = read("supabase/sql/run-now/75_memberships.sql")
    check("the plan's price record itself defaults to usd in the database", /currency text NOT NULL DEFAULT 'usd'/.test(plans))
    check("the Stripe price is made in the plan's own currency, Storelib's by default", /currency: plan\.currency \|\| STORELIB_CHARGE_CURRENCY,/.test(code("lib/memberships/billing.ts")))
    check("and the fee is computed in that same currency, never a different one", /membershipFee\(admin, creator\.id, price\.amountCents, plan\.currency\)/.test(code("app/api/memberships/checkout/route.ts")))
    const params = eventCheckoutParams({
      event: { id: PRODUCT, title: "Launch night", cover_url: null, starts_at: null, price_cents: 2500 } as never,
      community: { id: OTHER, name: "Makers", slug: "makers" } as never,
      buyer: { userId: USER, email: "a@b.co" },
      creatorId: LEI,
      destination: "acct_123",
      currency: STORELIB_CHARGE_CURRENCY,
      fee: { platformFeeCents: 150, feePercent: 5, feeFixedCents: 25, planId: "free" } as never,
      now: Date.parse("2026-10-17T10:00:00Z"),
    })
    const line = (params.line_items ?? [])[0] as { price_data?: { currency?: string; unit_amount?: number } }
    check("a ticket's Stripe session is in usd for the amount on the row", line?.price_data?.currency === "usd" && line?.price_data?.unit_amount === 2500, line?.price_data)
    for (const f of ["app/api/community/[communityId]/events/[eventId]/checkout/route.ts", "app/api/community/[communityId]/learn/[programId]/checkout/route.ts"]) {
      const src = code(f)
      check(`${f.split("/").slice(3).join("/")} charges Storelib's currency`, /chargeCurrency: STORELIB_CHARGE_CURRENCY,/.test(src))
      check(`${f.split("/").slice(3).join("/")} reads no platform or store currency for it`, !/platformChargeCurrency|readStoreCurrency|cachedStoreCurrency/.test(src))
    }
    check("the tickets card shows the creator the same currency it will charge", /currency: STORELIB_CHARGE_CURRENCY,/.test(code("lib/communities/server/event-ticket-setup.ts")))
    check("so does the Learn builder, and the program it saves", /currency: STORELIB_CHARGE_CURRENCY,/.test(code("lib/communities/server/learn-builder.ts")) && /currency: STORELIB_CHARGE_CURRENCY/.test(code("app/api/app/community/[id]/learn/[programId]/route.ts")))
  }

  console.log("\nChanging the website currency moves no Storelib price")
  {
    const before = await readStoreCurrency(world("USD"), LEI)
    const after = await readStoreCurrency(world("RON"), LEI)
    check("the store really did move, so the rest of this means something", before.currency === "USD" && after.currency === "RON")

    const platformBefore = await checkoutSurfaceCurrency(world("USD"), { host: PLATFORM_HOST, creatorId: LEI })
    const platformAfter = await checkoutSurfaceCurrency(world("RON"), { host: PLATFORM_HOST, creatorId: LEI })
    check("Storelib's checkout charges the same currency before and after", platformBefore.charge === platformAfter.charge && platformAfter.charge === "usd", [platformBefore.charge, platformAfter.charge])

    const cardBefore = listPrice({ price_cents: 4900, currency: surfaceCurrency("explore", before.currency) })
    const cardAfter = listPrice({ price_cents: 4900, currency: surfaceCurrency("explore", after.currency) })
    check("an Explore card says the same thing before and after", cardBefore.main === cardAfter.main && cardAfter.main === "$49.00", [cardBefore.main, cardAfter.main])

    const pageBefore = surfaceCurrency("creator_page", before.currency)
    const pageAfter = surfaceCurrency("creator_page", after.currency)
    check("so does the creator page", pageBefore === pageAfter && pageAfter === "USD")

    const planBefore = priceLine({ kind: "paid", billing: "recurring", monthlyCents: 2400 })
    const planAfter = priceLine({ kind: "paid", billing: "recurring", monthlyCents: 2400 })
    check("and the community's plan line", planBefore === planAfter && planAfter === "$24/month", [planBefore, planAfter])

    const siteBefore = await checkoutSurfaceCurrency(world("USD"), { host: SITE_HOST, creatorId: LEI })
    const siteAfter = await checkoutSurfaceCurrency(world("RON"), { host: SITE_HOST, creatorId: LEI })
    check("the website checkout is the one thing that did move, which is the point", siteBefore.charge === "usd" && siteAfter.charge === "ron", [siteBefore.charge, siteAfter.charge])
  }

  console.log("\nHistorical orders keep the currency they were made in")
  {
    check("an order in lei stays lei", orderCurrency("ron") === "RON" && orderCurrency("RON") === "RON")
    check("an order in dollars stays dollars", orderCurrency("usd") === "USD")
    check("an order with nothing recorded falls back to the deployment's, not to a surface's", orderCurrency(null) === SHOP_CURRENCY)
    check("payouts count a run of sales in the currency they were charged in", salesCurrencyOf([{ currency: "ron" }, { currency: "ron" }, { currency: "usd" }], "usd") === "ron")
    check("and say so even when it is not the one any surface quotes today", salesCurrencyOf([{ currency: "RON" }], "usd") === "ron")

    const sql = read("supabase/sql/run-now/176_store_currency.sql")
    const targets = sql.slice(sql.indexOf("store_currency_targets()"), sql.indexOf("store_change_currency("))
    for (const table of ["orders", "order_items", "refunds", "invoices", "payouts", "seller_ledger", "ledger_events", "memberships", "membership_invoices", "community_event_tickets"]) {
      check(`the currency change rewrites no ${table} row`, !new RegExp(`'${table}'`).test(targets))
    }
    check("it says in as many words that orders keep their currency", /Orders, refunds, invoices, payouts and the wallet keep the currency they were made in and are never touched/.test(sql))
    check("and every value it does change is kept first, so it can be put back", /store_currency_snapshots/.test(sql) && /store_currency_restore/.test(sql))

    const fulfil = code("lib/checkout/fulfil-payment.ts")
    check("an order is written in the currency the PaymentIntent was made in", /currency: \(paid\.currency \|\| m\.currency \|\| "usd"\)\.toLowerCase\(\)/.test(fulfil))
    check("its invoice in the order's own currency", /currency: row\.currency,/.test(fulfil))
    check("and the wallet converts from the order's currency rather than assuming one", /toLedger\(/.test(fulfil) && /currency: row\.currency \}/.test(fulfil))
  }

  console.log("\nTHE LEAK, and the proof these checks catch it")
  {
    /*
      Each pair below is the answer the old code gave beside the answer the
      boundary gives. The old answer is built from the real primitives the
      old code used: the store's currency read from its settings, and the
      platform charge currency the surfaces fell back to. If any surface
      above went back to reading either of those, its check fails with the
      left hand value.
    */
    const store = await readStoreCurrency(world("RON"), LEI)
    const leaked = shopMoneyIn(4900, store.currency, { grouping: true })
    const now = listPrice({ price_cents: 4900, currency: STORELIB_CURRENCY }).main
    console.log(`        a 4900 row on an Explore card: was ${leaked}, now ${now}`)
    check("the leaked label and the boundary's differ, so the check above is not vacuous", leaked !== now && /lei|RON/.test(leaked) && now === "$49.00", [leaked, now])

    const leakedCharge = store.currency.toLowerCase()
    const nowCharge = (await checkoutSurfaceCurrency(world("RON"), { host: PLATFORM_HOST, creatorId: LEI })).charge
    console.log(`        Storelib's checkout for it: was ${leakedCharge}, now ${nowCharge}`)
    check("the leaked charge currency and the boundary's differ too", leakedCharge === "ron" && nowCharge === "usd")

    const leakedFallback = shopMoneyIn(4900, SHOP_CURRENCY, { grouping: true })
    console.log(`        a card nobody told: was ${leakedFallback}, now ${usd(4900)}`)
    check("a card with no currency no longer follows the deployment's charge currency", leakedFallback !== usd(4900) && usd(4900) === "$49.00", [leakedFallback, usd(4900)])

    check("no surface file reads the platform charge currency to price itself", [
      "app/(marketing)/u/[username]/layout.tsx",
      "app/(marketing)/p/[slug]/layout.tsx",
      "app/(marketing)/l/[slug]/page.tsx",
      "app/(marketing)/explore/page.tsx",
      "app/(marketing)/explore/[category]/page.tsx",
      "app/api/checkout/stripe-session/route.ts",
      "app/api/community/[communityId]/events/[eventId]/checkout/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/route.ts",
    ].every((f) => !/platformChargeCurrency/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

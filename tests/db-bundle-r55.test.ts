/**
 * Round 55: one shop, almost no visitors, 630 Supabase requests a minute.
 *
 * The owner's API logs, every minute: 255 products ok, 255 store_settings
 * ok, 90 products failed (400), 15 size_charts ok, 15 size_charts failed
 * (400). So 15 runs a minute, each 17 products + 17 store_settings + 6
 * products refused + 1 + 1 size_charts.
 *
 * Measured over the fake PostgREST of scripts/speed18 (the real supabase-js
 * client and the real server code), with the columns a database without
 * SQL parts 131 and 309 lacks answered 42703 as PostgREST does:
 *
 *   1. One cold draw of an imported theme's product page asks almost that:
 *      15 products, 14 store_settings, 2 products refused, 2 + 1 size_charts.
 *      A cold home page 11 products, 13 store_settings and exactly 1 + 1
 *      size_charts (sizeChartsForStore). Every ask with a column the
 *      database lacks was refused on EVERY draw, never remembered.
 *   2. Those reads now go through lib/supabase/missing-memory readLadder:
 *      refused once per server per ten minutes, and only for a missing
 *      column. A real error (a 500) is answered as it came and remembers
 *      nothing.
 *   3. The shop's commerce settings, home country, shipping profiles and
 *      locations are asked once per request (lib/supabase/per-client.ts),
 *      not once per product. Stock (inventory_levels) is read on every call.
 *   4. Two pages that reloaded themselves forever now back off and stop:
 *      the cart checkout's "Confirming your payment" (every 4 s, the
 *      logs' exact cadence) and a website's 503 "One moment" (every 5 s).
 *
 * Run with:  npm run test:push
 */
import { createClient } from "@supabase/supabase-js"
import { readCode } from "./_source"
import { fakeFetch, useFixture } from "../scripts/speed18/fake-postgrest"
import { buildFixture, SITE } from "../scripts/speed18/fixture"
import { forgetMissing } from "../lib/supabase/missing-memory"
import { HOLD_MS, oncePerClient } from "../lib/supabase/per-client"
import { PENDING_TRIES, pendingDelayMs, pendingRetryUrl } from "../lib/checkout/pending-poll"
import { ONE_MOMENT_TRIES, oneMomentDelay, oneMomentHtml } from "../lib/net/one-moment"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"

/* ── A counting PostgREST: every request by table and status; chosen columns missing (42703) or failing (500) ── */

type Hit = { table: string; status: number; select: string }
const hits: Hit[] = []
let missing: Record<string, string[]> = {}
let broken: Record<string, string[]> = {}
const colsOf = (select: string) => select.split(",").map((c) => c.trim().split(":").pop()!.split("(")[0].trim())
const counting = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  const m = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)
  if (!m) return fakeFetch(input as never, init as never)
  const table = m[1]
  const select = url.searchParams.get("select") ?? "*"
  const cols = colsOf(select)
  const reading = !init?.method || init.method === "GET" || init.method === "HEAD"
  const gone = reading ? (missing[table] ?? []).find((c) => cols.includes(c)) : undefined
  const hurt = reading ? (broken[table] ?? []).find((c) => cols.includes(c)) : undefined
  if (gone || hurt) {
    hits.push({ table, status: gone ? 400 : 500, select })
    const body = gone ? { code: "42703", message: `column ${table}.${gone} does not exist`, details: null, hint: null } : { code: "XX000", message: "internal error", details: null, hint: null }
    return new Response(JSON.stringify(body), { status: gone ? 400 : 500, headers: { "content-type": "application/json" } })
  }
  const res = await fakeFetch(input as never, init as never)
  hits.push({ table, status: res.status, select })
  return res
}

/** One request's own client, as createAdminClient makes one per request. */
const client = () => createClient("https://fixture.supabase.co", "service-fixture-key", { global: { fetch: counting as typeof fetch }, auth: { persistSession: false, autoRefreshToken: false } }) as never

type Count = { ok: number; refused: number }
function counted(): Record<string, Count> {
  const out: Record<string, Count> = {}
  for (const h of hits) {
    const c = (out[h.table] ??= { ok: 0, refused: 0 })
    if (h.status >= 400) c.refused++
    else c.ok++
  }
  return out
}
const n = (c: Record<string, Count>, table: string, k: keyof Count = "ok") => c[table]?.[k] ?? 0
async function run<T>(fn: () => Promise<T>): Promise<{ value: T; c: Record<string, Count>; hits: Hit[] }> {
  hits.length = 0
  const value = await fn()
  return { value, c: counted(), hits: [...hits] }
}

/* ── The shop: 17 products, 4 of them ship (3 sizes each), one with its own size chart ── */

const CHART = "c0000000-0000-4000-8000-000000000001"
function shop() {
  const f = buildFixture()
  const mine = f.tables.products.filter((p) => p.creator_id === SITE.creatorId).slice(0, 17)
  f.tables.products = [...f.tables.products.filter((p) => p.creator_id !== SITE.creatorId), ...mine]
  const physical = mine.filter((p) => p.type === "physical") as (Record<string, unknown> & { id: string })[]
  for (const p of physical) Object.assign(p, { track_inventory: true, continue_selling: false, low_stock_threshold: null, max_per_order: null, weight_grams: 300, requires_shipping: true, fulfillment_method: "self", shipping_profile_id: null })
  f.tables.store_settings = [{ creator_id: SITE.creatorId, store_name: "Maya", currency: "USD", default_country: "US", reviews: null }]
  f.tables.commerce_settings = [{ creator_id: SITE.creatorId, returns_enabled: true, return_window_days: 30, default_location_id: "e0000000-0000-4000-8000-000000000001", low_stock_default: 5 }]
  f.tables.inventory_locations = [{ id: "e0000000-0000-4000-8000-000000000001", creator_id: SITE.creatorId, name: "Studio", city: "Austin", country: "US", active: true, fulfills_orders: true, pickup_enabled: true, priority: 0, created_at: "2026-01-01T00:00:00Z" }]
  f.tables.inventory_levels = f.tables.product_variants.filter((v) => physical.some((p) => p.id === v.product_id)).map((v) => ({ variant_id: v.id, location_id: "e0000000-0000-4000-8000-000000000001", available: 3 }))
  f.tables.size_charts = [{ id: CHART, creator_id: SITE.creatorId, name: "Tops", unit: "cm", columns: ["Size", "Chest"], rows: [["S", "90"]], notes: null, image_url: null, collection_ids: [], categories: ["design"] }]
  f.tables.product_size_charts = [{ product_id: physical[0].id, size_chart_id: CHART, creator_id: SITE.creatorId }]
  return { f, mine, physical }
}

async function main() {
  const { f, mine, physical } = shop()
  useFixture(f)
  const { pageFactsFor } = await import("../lib/storelib-theme/compat/product-facts-server")
  const { sizeChartsForStore, sizeChartForProduct } = await import("../lib/size-charts/storefront")
  const { orderLimits } = await import("../lib/physical/order-limit")
  const { variantChoices } = await import("../lib/checkout/variant-choices-server")
  const { physicalStock } = await import("../lib/physical/storefront-stock")
  const { catalogCards } = await import("../lib/website-builder/shop-products")
  const { productSectionData } = await import("../lib/products/product-section-data")

  console.log("\nA column the database lacks is refused once per server, not on every page (parts 131 and 309 not run)\n")
  {
    forgetMissing()
    missing = { products: ["max_per_order"], size_charts: ["collection_ids"] }
    const first = await run(() => pageFactsFor(client(), SITE.creatorId, physical[0].id, true))
    check("the first product page's facts: answered, after the ask with Limit sales was refused", !!first.value && first.value.variants.length === 3 && n(first.c, "products", "refused") === 2, first.c.products)
    const again = await run(() => pageFactsFor(client(), SITE.creatorId, physical[0].id, true))
    check("the next one asks no column the database lacks: no products refused", !!again.value && n(again.c, "products", "refused") === 0, again.hits.filter((h) => h.status >= 400))
    check("  and draws the same variants", JSON.stringify(again.value?.variants) === JSON.stringify(first.value?.variants))
    console.log(`        products per page facts: ${n(first.c, "products")} ok + ${n(first.c, "products", "refused")} refused first, ${n(again.c, "products")} ok + ${n(again.c, "products", "refused")} refused after (it was 2 ok + 2 refused on every page)`)

    const store1 = await run(() => sizeChartsForStore(client(), SITE.creatorId))
    const store2 = await run(() => sizeChartsForStore(client(), SITE.creatorId))
    check("the store's size charts: the chart set for a category is asked once and refused (part 309 missing)", n(store1.c, "size_charts", "refused") === 1 && Object.keys(store1.value).length === 1, store1.c.size_charts)
    check("  and not again: 1 size_charts ok, 0 refused (it was 1 + 1 on every draw)", n(store2.c, "size_charts") === 1 && n(store2.c, "size_charts", "refused") === 0 && Object.keys(store2.value).length === 1, store2.c.size_charts)
    const own = await run(() => sizeChartForProduct(client(), physical[1].id, SITE.creatorId))
    check("a product with no chart of its own asks no collection or category chart either", own.value === null && n(own.c, "size_charts", "refused") === 0, own.c)

    const limits = await run(() => orderLimits(client(), physical.map((p) => p.id)))
    check("Limit sales before part 131: no limit, and not asked again", limits.value.size === 0 && n(limits.c, "products") + n(limits.c, "products", "refused") === 0, limits.c)
  }

  console.log("\nOnly a missing column is remembered: a real error is answered as it came, and the next read asks the whole list again\n")
  {
    forgetMissing()
    missing = {}
    broken = { products: ["max_per_order"] }
    const hurt = await run(() => pageFactsFor(client(), SITE.creatorId, physical[0].id, true))
    check("a 500 on the first ask: no step down to fewer columns, the page draws from its list copy (null)", hurt.value === null && hurt.hits.filter((h) => h.table === "products").length === 1, hurt.hits.map((h) => `${h.status} ${h.select.slice(0, 40)}`))
    broken = {}
    const healed = await run(() => pageFactsFor(client(), SITE.creatorId, physical[0].id, true))
    check("  and the next read asks with Limit sales again: nothing was remembered", !!healed.value && healed.hits.some((h) => h.table === "products" && h.status === 200 && /max_per_order/.test(h.select)), healed.hits.map((h) => `${h.status} ${h.select.slice(0, 40)}`))
    const limits = await run(() => orderLimits(client(), [physical[0].id]))
    check("  Limit sales is read with its column again too", limits.hits.some((h) => h.status === 200 && /max_per_order/.test(h.select)))
    broken = { size_charts: ["collection_ids"] }
    await run(() => sizeChartsForStore(client(), SITE.creatorId))
    broken = {}
    const back = await run(() => sizeChartsForStore(client(), SITE.creatorId))
    check("  and a 500 on the rule charts is not remembered as part 309 missing", back.hits.some((h) => h.table === "size_charts" && /collection_ids/.test(h.select) && h.status === 200))
  }

  console.log("\nThe shop's own settings are asked once per request, not once per product\n")
  {
    forgetMissing()
    missing = { products: ["max_per_order"], size_charts: ["collection_ids"] }
    await run(() => variantChoices(client(), physical.map((p) => p.id)))
    const db = client()
    const choices = await run(() => variantChoices(db, physical.map((p) => p.id)))
    check("a quote's other options for every product that ships: each one's options", Object.keys(choices.value).length === physical.length, Object.keys(choices.value).length)
    check(`  commerce_settings once (it was ${physical.length}, one per product)`, n(choices.c, "commerce_settings") === 1, choices.c.commerce_settings)
    check(`  the locations that fulfil orders once (it was ${physical.length})`, n(choices.c, "inventory_locations") === 1, choices.c.inventory_locations)
    check(`  and what each location holds is still read for every product: ${physical.length} inventory_levels`, n(choices.c, "inventory_levels") === physical.length, choices.c.inventory_levels)
    console.log(`        per quote of ${physical.length} shipped products: ${choices.hits.length} requests (commerce_settings ${n(choices.c, "commerce_settings")}, inventory_locations ${n(choices.c, "inventory_locations")}, inventory_levels ${n(choices.c, "inventory_levels")})`)

    const section = await run(() => productSectionData(client(), { ...physical[0], creator_id: SITE.creatorId } as never, { counts: true }))
    check("one product section: commerce_settings once (it was twice: delivery and stock)", n(section.c, "commerce_settings") === 1 && !!section.value.delivery, section.c.commerce_settings)
    check("  store_settings once (the home country)", n(section.c, "store_settings") === 1, section.c.store_settings)
    console.log(`        per product section: ${section.hits.length} requests, ${n(section.c, "products")} products, ${n(section.c, "store_settings")} store_settings, ${n(section.c, "commerce_settings")} commerce_settings, 0 refused`)

    const cards1 = await run(() => catalogCards(client(), SITE.creatorId))
    const cards2 = await run(() => catalogCards(client(), SITE.creatorId))
    check(`the catalogue's ${mine.length} cards: the store's currency and its Reviews settings once each per request`, cards1.value.length === mine.length && n(cards1.c, "store_settings") === 2, cards1.c.store_settings)
    check("  and no products refused on the second list", n(cards2.c, "products", "refused") === 0, cards2.c.products)

    /* Stock is never held between requests: a level that changes is read by the next request. */
    const lvl = f.tables.inventory_levels.find((l) => l.variant_id === f.tables.product_variants.find((v) => v.product_id === physical[0].id)!.id)!
    const variants = f.tables.product_variants.filter((v) => v.product_id === physical[0].id).map((v) => ({ id: String(v.id), name: String(v.name), active: true, track_inventory: true, inventory_policy: "deny" }))
    const stockProduct = { id: physical[0].id as string, creator_id: SITE.creatorId, track_inventory: true, continue_selling: false, low_stock_threshold: null }
    const s1 = await physicalStock(client(), stockProduct, variants)
    lvl.available = 0
    const s2 = await physicalStock(client(), stockProduct, variants)
    check("a variant sold out between two requests is sold out on the second: stock is read live", s1.get(String(lvl.variant_id))?.soldOut === false && s2.get(String(lvl.variant_id))?.soldOut === true)
    const same = client()
    const s3 = await run(() => physicalStock(same, stockProduct, variants))
    lvl.available = 2
    const s4 = await run(() => physicalStock(same, stockProduct, variants))
    check("  even on the same client: inventory_levels is asked every call", n(s3.c, "inventory_levels") === 1 && n(s4.c, "inventory_levels") === 1 && s4.value.get(String(lvl.variant_id))?.soldOut === false)
  }

  console.log("\nOnce per client means per request, and never for long\n")
  {
    let asked = 0
    const read = async () => ++asked
    const a = {}
    const b = {}
    await Promise.all([oncePerClient(a, "k", read), oncePerClient(a, "k", read)])
    check("the same question on one request's client: asked once", asked === 1)
    await oncePerClient(b, "k", read)
    check("  another request's client asks again", asked === 2)
    const realNow = Date.now
    try {
      const t = realNow()
      Date.now = () => t + HOLD_MS + 1
      await oncePerClient(a, "k", read)
      check(`  and a client kept past ${HOLD_MS} ms asks again`, asked === 3)
    } finally {
      Date.now = realNow
    }
    let tries = 0
    const flaky = async () => {
      tries++
      if (tries === 1) throw new Error("blip")
      return tries
    }
    const c = {}
    await oncePerClient(c, "k", flaky).catch(() => null)
    check("  a read that threw is not kept", (await oncePerClient(c, "k", flaky)) === 2)
  }

  console.log("\nPages that reload themselves back off and stop\n")
  {
    const waits = Array.from({ length: PENDING_TRIES + 2 }, (_, i) => pendingDelayMs(i))
    check("Confirming your payment: the first wait is 4 s, as before", waits[0] === 4000)
    check("  each wait at least the one before, never over 30 s", waits.slice(0, PENDING_TRIES).every((w, i) => w !== null && w <= 30_000 && (i === 0 || w >= waits[i - 1]!)))
    check(`  and it stops after ${PENDING_TRIES} (it reloaded every 4 s forever: 15 a minute)`, waits[PENDING_TRIES] === null && waits[PENDING_TRIES + 1] === null)
    const total = waits.filter((w): w is number => w !== null).reduce((a, b) => a + b, 0)
    console.log(`        ${PENDING_TRIES} reloads over ${Math.round(total / 1000)} s, then Try again (was unbounded)`)
    check("  the count rides in the address and keeps its query", pendingRetryUrl("https://storelib.com/checkout/physical/order/abc?paid=1", 3) === "https://storelib.com/checkout/physical/order/abc?paid=1&try=3" && pendingRetryUrl("https://storelib.com/x?try=3", 0) === "https://storelib.com/x")
    const view = readCode("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")
    check("  the page waits while its tab is hidden, and has no fixed 4 s reload left", /visibilityState === "visible"/.test(view) && /pendingDelayMs\(tries\)/.test(view) && !/setTimeout\(\(\) => window\.location\.reload\(\), 4000\)/.test(view))

    check("One moment: 5 s first, doubling, then it stops", oneMomentDelay(0) === 5 && oneMomentDelay(1) === 10 && oneMomentDelay(ONE_MOMENT_TRIES - 1) === 5 * 2 ** (ONE_MOMENT_TRIES - 1) && oneMomentDelay(ONE_MOMENT_TRIES) === null)
    const firstPage = oneMomentHtml("?variant=7")
    check("  its first page refreshes to the same page, with its query and the next count", /<meta http-equiv="refresh" content="5;url=\?variant=7&amp;sl_try=1">/.test(firstPage) && /<title>One moment<\/title>/.test(firstPage), firstPage.slice(0, 260))
    const last = oneMomentHtml(`?sl_try=${ONE_MOMENT_TRIES}`)
    check("  the last refreshes no more and says to reload", !/http-equiv="refresh"/.test(last) && /Reload the page to try again\./.test(last))
    for (const route of ["app/api/site-theme/site/[username]/[[...path]]/route.ts", "app/(sites)/site/[slug]/[[...path]]/route.ts"]) {
      const code = readCode(route)
      check(`  ${route.split("/").slice(0, 3).join("/")}: its 503 is oneMomentHtml, no fixed refresh left`, /oneMomentHtml\(new URL\(req(uest)?\.url\)\.search\)/.test(code) && !/http-equiv="refresh" content="5"/.test(code))
    }
  }

  console.log("\nThe ladders on the path go through readLadder\n")
  {
    const files: [string, RegExp][] = [
      ["lib/storelib-theme/compat/product-facts-server.ts", /readLadder\("products:page-facts"/],
      ["lib/size-charts/storefront.ts", /readLadder\("size_charts:rules"/],
      ["lib/physical/order-limit.ts", /readLadder\("products:max_per_order"/],
      ["lib/website-builder/compat-site.ts", /readLadder\("products:compat-description"/],
      ["lib/products/product-section-data.ts", /readLadder\(\s*"product_variants:section"/],
      ["lib/products/personalization-read.ts", /readLadder\("products:personalization"/],
      ["lib/website-builder/shop-products.ts", /readLadder\("products:custom_fields"/],
      ["lib/website-builder/shop-products.ts", /readLadder\(\s*"products:cards"/],
      ["lib/website-builder/product-extras.ts", /readLadder\("products:faqs"/],
      ["lib/website-builder/storefront-data-server.ts", /readLadder\(\s*"products:picked"/],
      ["app/api/website-builder/products/route.ts", /readLadder\("products:builder-list-faqs"/],
      ["app/api/onepage/product/route.ts", /readLadder\("product_variants:onepage"/],
    ]
    for (const [file, re] of files) check(`${file}`, re.test(readCode(file)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

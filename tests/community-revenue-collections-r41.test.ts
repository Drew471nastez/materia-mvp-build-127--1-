/**
 * Round 41.
 *
 * 1. Community money: one fake dataset, the same MRR on the community list,
 *    its Overview and its Analytics, and the same payments received in the
 *    community's Analytics and in /app/analytics (lib/communities/
 *    membership-money.ts, lib/analytics/commerce commerceReport).
 * 2. Collections are pages of their own (tests/collections-ui.test.ts holds
 *    the rest).
 * 3. Edit profile says what happened beside Save and dims Save with nothing
 *    to save.
 * 4. A code's minimum order: the covered lines after automatic offers,
 *    before the code, in the physical checkout and the basket alike.
 * 5. Inventory's Low view includes items at 0, as the low stock email does.
 *
 *   npx tsx --conditions=react-server tests/community-revenue-collections-r41.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { mrrAt, monthlyOf, payingAt, paymentsIn } from "@/lib/communities/membership-money"
import { commerceReport } from "@/lib/analytics/commerce"
import { couponMinimumError, minimumBase } from "@/lib/checkout/coupon-scope"
import { checkCouponLines, type CouponRow } from "@/lib/checkout/coupons"
import { inInventoryView } from "@/lib/physical/inventory-rules"
import { moneyTotal } from "@/lib/communities/membership-money"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type Row = Record<string, unknown>

const CID = "c4100000-0000-4000-8000-000000000001"
const YEARLY = "c4100000-0000-4000-8000-0000000000a1"
const MONTHLY = "c4100000-0000-4000-8000-0000000000a2"
const NOW = Date.parse("2026-10-15T12:00:00Z")
const SPAN = { start: Date.parse("2026-10-01T00:00:00Z"), end: NOW }

/* ONE DATASET. A $1,000 a year plan paid in August, a $20 a month plan paid on 2 October and refunded $5 the same day, a trial, a cancelled member. */
const memberships: Row[] = [
  { id: "m1", buyer_id: "u1", product_id: YEARLY, status: "active", billing_interval: "year", amount_cents: 100_000, currency: "usd", created_at: "2026-08-01T10:00:00Z", started_at: "2026-08-01T10:00:00Z", canceled_at: null, ended_at: null, trial_end: null },
  { id: "m2", buyer_id: "u2", product_id: MONTHLY, status: "active", billing_interval: "month", amount_cents: 2000, currency: "usd", created_at: "2026-10-02T10:00:00Z", started_at: "2026-10-02T10:00:00Z", canceled_at: null, ended_at: null, trial_end: null },
  { id: "m3", buyer_id: "u3", product_id: MONTHLY, status: "trialing", billing_interval: "month", amount_cents: 2000, currency: "usd", created_at: "2026-10-10T10:00:00Z", started_at: "2026-10-10T10:00:00Z", canceled_at: null, ended_at: null, trial_end: "2026-10-24T10:00:00Z" },
  { id: "m4", buyer_id: "u4", product_id: MONTHLY, status: "canceled", billing_interval: "month", amount_cents: 2000, currency: "usd", created_at: "2026-07-01T10:00:00Z", started_at: "2026-07-01T10:00:00Z", canceled_at: "2026-09-20T10:00:00Z", ended_at: "2026-09-20T10:00:00Z", trial_end: null },
]
const orders: Row[] = [
  { id: "o1", product_id: YEARLY, creator_id: "s1", created_at: "2026-08-01T10:00:05Z", amount_cents: 100_000, refund_amount_cents: null, refunded_at: null, status: "completed", currency: "usd", stripe_session_id: null, buyer_email: "u1@x.test", source: null, source_detail: null },
  { id: "o2", product_id: MONTHLY, creator_id: "s1", created_at: "2026-10-02T10:00:05Z", amount_cents: 2000, refund_amount_cents: 500, refunded_at: "2026-10-02T18:00:00Z", status: "refunded", currency: "usd", stripe_session_id: null, buyer_email: "u2@x.test", source: null, source_detail: null },
]

async function communityMoney() {
  console.log("\n1. Community money, one dataset, every screen\n")
  const tables: Record<string, Row[]> = {
    communities: [{ id: CID, owner_user_id: "owner", creator_id: "s1", created_at: "2026-06-01T00:00:00Z" }],
    community_members: [],
    community_activity: [],
    community_daily_stats: [],
    community_daily_traffic: [],
    community_view_days: [],
    community_feed_posts: [],
    community_events: [],
    community_tiers: [
      { community_id: CID, product_id: YEARLY, billing: "recurring", kind: "paid", name: "Yearly" },
      { community_id: CID, product_id: MONTHLY, billing: "recurring", kind: "paid", name: "Monthly" },
    ],
    products: [],
    memberships,
    orders,
    community_program_access: [],
    community_module_access: [],
    community_event_tickets: [],
    profiles: [],
  }
  const base = fakeDb(tables)
  const db = { from: base.from, rpc: async () => ({ data: null, error: null }) }

  /* What the rule says by hand. */
  const mrrByHand = Math.round(100_000 / 12) + 2000
  check("a yearly plan is a twelfth of its price a month ($1,000 is $83.33)", monthlyOf({ billing_interval: "year", amount_cents: 100_000 }) === 8333)
  check("a trial is not paying yet, a cancelled member no longer", !payingAt(memberships[2] as never, NOW) && !payingAt(memberships[3] as never, NOW) && payingAt(memberships[0] as never, NOW))
  check("MRR now: $83.33 + $20.00, from two paying members", mrrAt(memberships as never, NOW).cents === mrrByHand && mrrAt(memberships as never, NOW).paying === 2)

  const { communityMrr } = await import("@/lib/communities/server/membership-money")
  const listMrr = await communityMrr(db as never, CID, NOW)
  check("the community list's card and the Overview read the same MRR", listMrr.cents === mrrByHand && listMrr.paying === 2, listMrr)

  const { loadCommunityReport } = await import("@/lib/communities/server/analytics-report")
  const report = await loadCommunityReport(db as never, tables.communities[0] as never, { start: SPAN.start, end: SPAN.end, compare: null, timeZone: "UTC" }, NOW)
  const m = report.money
  check("the community's Analytics: the same MRR at the end of the period, the same paying members", m?.figures.mrr.value === mrrByHand && m?.figures.subscribers.value === 2, m?.figures)

  /* Payments received in October: the $20 less its $5 refund. The yearly plan was paid in August. */
  const received = paymentsIn(orders as never, SPAN)
  check("payments received are what came in during the period: $15.00, not the MRR", received.cents === 1500 && received.count === 1, received)
  check("the community's Analytics Revenue is the payments received", m?.figures.revenue.value === received.cents, m?.figures.revenue)

  const commerce = commerceReport({
    rows: orders as never,
    span: SPAN,
    previous: null,
    timeZone: "UTC",
    selector: { type: "all" },
    properties: { onePageId: null, websites: [], defaultWebsite: null },
    productId: null,
    mode: "all",
    productTypes: { [YEARLY]: "membership", [MONTHLY]: "membership" },
  })
  check("/app/analytics counts the same orders to the same cent", commerce.breakdown.total === received.cents, commerce.breakdown)

  /* August: the yearly payment is revenue there, and only there. */
  const aug = { start: Date.parse("2026-08-01T00:00:00Z"), end: Date.parse("2026-09-01T00:00:00Z") }
  const augReport = await loadCommunityReport(db as never, tables.communities[0] as never, { start: aug.start, end: aug.end, compare: null, timeZone: "UTC" }, NOW)
  const augCommerce = commerceReport({ rows: orders as never, span: aug, previous: null, timeZone: "UTC", selector: { type: "all" }, properties: { onePageId: null, websites: [], defaultWebsite: null }, productId: null, mode: "all", productTypes: {} })
  check("a yearly plan is $1,000 received in the month it was paid, in both places", augReport.money?.figures.revenue.value === 100_000 && augCommerce.breakdown.total === 100_000, { community: augReport.money?.figures.revenue, analytics: augCommerce.breakdown.total })

  /* /app/analytics' Community revenue card adds the communities up from the same answers. */
  const one = { currency: "usd", figures: { revenue: { value: 1500, previous: null }, mrr: { value: mrrByHand, previous: null }, subscribers: { value: 2, previous: null } }, bySource: [{ key: "memberships" as const, cents: 1500 }] }
  const two = { currency: "usd", figures: { revenue: { value: 900, previous: null }, mrr: { value: 900, previous: null }, subscribers: { value: 1, previous: null } }, bySource: [{ key: "tickets" as const, cents: 900 }] }
  const all = moneyTotal([one, two])
  check("All communities is the sum of each, MRR and payments apart", all?.revenue.value === 2400 && all?.mrr.value === mrrByHand + 900 && all?.paying === 3 && all?.bySource.length === 2, all)
  check("  and communities in two currencies are never added together", moneyTotal([one, { ...two, currency: "eur" }]) === null)

  const reports = read("app/(storelib)/app/analytics/community-reports.tsx")
  const creator = read("lib/communities/server/creator.ts")
  const stats = read("lib/communities/server/stats.ts")
  const ar = read("lib/communities/server/analytics-report.ts")
  check("one rule: the list, the Overview, the stats and the report all read ../membership-money", /* Changed on purpose (round 43): the list, the Overview and the stats read MRR through mrrOfRows, mrrAt in the store's currency. */ /mrrOfRows\(|communityMrr\(/.test(creator) && /mrrOfRows\(/.test(stats) && /communitySellingProducts/.test(creator) && /from "\.\.\/membership-money"/.test(ar) && !/monthlyValue/.test(creator + stats + ar))
  check("/app/analytics shows Community revenue with a switcher by community, Payments received and MRR named apart", /title=\{tt\("Community revenue"\)\}/.test(reports) && /<ReportTabs label=\{tt\("Community"\)\}/.test(reports) && /tt\("Payments received"\)/.test(reports) && /tt\("MRR now"\)/.test(reports))
  check("the Overview calls it MRR, a level, not Monthly revenue", /label: tt\("MRR"\), value: money\(f\.mrrCents, f\.currency\)/.test(read("components/community/creator/logic.ts")))
}

function collectionsArePages() {
  console.log("\n2. Collections are pages\n")
  const DIR = "app/(storelib)/app/products/collections"
  check("/new and /<id> are routes with a layer each, and no loading boundary", ["new/page.tsx", "new/layout.tsx", "[id]/page.tsx", "[id]/layout.tsx"].every((f) => existsSync(`${DIR}/${f}`)) && !existsSync(`${DIR}/new/loading.tsx`) && !existsSync(`${DIR}/[id]/loading.tsx`) && !existsSync(`${DIR}/loading.tsx`))
  const editor = read(`${DIR}/collection-editor.tsx`)
  check("the editor is a page, not a sheet or a dialog", !/SheetDialog/.test(editor.replace(/\/\*[\s\S]*?\*\//g, "")) && /export function CollectionPage/.test(editor) && /collectionsReturn\.useOrigin\(\)/.test(editor))
  check("another store's collection or a bad id goes back to the list", /if \(!UUID\.test\(id\)\) redirect\("\/app\/products\/collections"\)/.test(read(`${DIR}/[id]/page.tsx`)) && /if \(!collection\) redirect/.test(read(`${DIR}/[id]/page.tsx`)))
  check("search opens a collection on its page", /href: `\/app\/products\/collections\/\$\{encodeURIComponent/.test(read("lib/search/app-search.ts")))
}

function editProfile() {
  console.log("\n3. Edit profile\n")
  const sheet = read("components/storefront/editor-sheet.tsx")
  const button = read("components/storefront/edit-profile-button.tsx")
  check("what went wrong is said beside Save, pinned, not under the form", /data-sheet-message=\{error \? "error" : "notice"\}/.test(sheet) && !/\{error && <p className="text-sm text-destructive">/.test(sheet))
  check("saved but not on the page yet is a grey notice, not an error", /setNotice\("Saved\. It shows on your page/.test(button) && !/setError\("Saved,/.test(button))
  check("Save dims with nothing to save, and a message goes once the form is touched", /saveDisabled=\{name\.trim\(\)\.length === 0 \|\| !dirty\}/.test(button) && /lastForm\.current = formNow\s*\n\s*setError\(null\)\s*\n\s*setNotice\(null\)/.test(button))
  check("the /app fields, not the library's look", /className=\{FIELD\}/.test(button) && /<Label className=\{LABEL\}/.test(button))
}

async function couponMinimum() {
  console.log("\n4. A code's minimum: after the offers, before the code, in both checkouts\n")
  check("the base is the covered lines after offers", minimumBase([4500, 1000], [true, false]) === 4500 && minimumBase([-5, 300], [true, true]) === 300)
  check("under it is refused with the amount, met is fine, none is fine", /at least \$50\.00/.test(couponMinimumError({ min_purchase_cents: 5000 }, [4999], [true], "USD") ?? "") && couponMinimumError({ min_purchase_cents: 5000 }, [5000], [true]) === null && couponMinimumError({ min_purchase_cents: null }, [1], [true]) === null)

  const coupon = (min: number): CouponRow => ({ id: "cp", code: "BIG", creator_id: "s1", discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: min } as unknown as CouponRow)
  check("checkCouponLines holds the minimum to the cents it is given (after offers)", checkCouponLines(coupon(5000), [{ productId: "a", creatorId: "s1", cents: 4999 }]).ok === false && checkCouponLines(coupon(5000), [{ productId: "a", creatorId: "s1", cents: 5000 }]).ok === true)

  /* THE SAME CART IN BOTH CHECKOUTS: $36 + $20 = $56, a bundle takes 10% off ($50.40 left). */
  const A = "c4100000-0000-4000-8000-0000000000b1"
  const B = "c4100000-0000-4000-8000-0000000000b2"
  const SHOP = "c4100000-0000-4000-8000-0000000000c1"
  const bundle = { id: "c4100000-0000-4000-8000-0000000000e1", creator_id: SHOP, kind: "bundle", title: "Both", product_ids: [A, B], trigger_product_ids: [], discount_type: "percent", discount_value: 10, active: true, position: 0, created_at: "2026-10-01T00:00:00Z", trigger_collection_ids: [], placements: ["product", "cart", "checkout"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers: [] }
  const codeRow = (min: number) => ({ id: "cp1", code: "BIG", creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: min, physical_only: false, collection_ids: null, free_shipping: false, per_customer_limit: null })

  /* The basket (digital lines). */
  const { priceCart } = await import("@/lib/checkout/pricing")
  const digital = (min: number) =>
    fakeDb({
      products: [A, B].map((id, i) => ({ id, title: `P${i}`, slug: `p${i}`, price_cents: i === 0 ? 3600 : 2000, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: null, type: "digital", status: "published", creator_id: SHOP })),
      product_variants: [],
      entitlements: [],
      coupons: [codeRow(min)],
      store_offers: [bundle],
      store_settings: [{ creator_id: SHOP, currency: "USD" }],
      product_collections: [],
      product_collection_items: [],
    })
  const basketOver = await priceCart(digital(5000) as never, { items: [{ productId: A }, { productId: B }], couponCode: "big" })
  const basketUnder = await priceCart(digital(5500) as never, { items: [{ productId: A }, { productId: B }], couponCode: "big" })
  check("basket: a $50 minimum is met by $50.40 after the bundle", basketOver.ok === true && (basketOver as { coupon?: { code: string } | null }).coupon?.code === "BIG", basketOver)
  check("basket: a $55 minimum is not, though the list prices come to $56", basketUnder.ok === false && /at least \$55\.00/.test((basketUnder as { error: string }).error), basketUnder)

  /* The physical checkout (shipped lines). */
  const { priceCheckout, readItems } = await import("@/lib/physical/checkout-pricing-server")
  const physical = (min: number) => {
    const product = (id: string, cents: number) => ({ id, creator_id: SHOP, title: id === A ? "Tee" : "Mug", slug: id === A ? "tee" : "mug", price_cents: cents, type: "physical", status: "published", thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: false, continue_selling: true, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null, compare_at_cents: null })
    const variant = (id: string, productId: string, cents: number) => ({ id, product_id: productId, name: "Default", price_cents: cents, weight_grams: 200, track_inventory: false, inventory_policy: "continue", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null, position: 0, compare_at_price_cents: null })
    return fakeDb({
      products: [product(A, 3600), product(B, 2000)],
      product_variants: [variant("c4100000-0000-4000-8000-0000000000d1", A, 3600), variant("c4100000-0000-4000-8000-0000000000d2", B, 2000)],
      product_options: [],
      commerce_settings: [{ creator_id: SHOP, default_location_id: "loc", unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
      inventory_locations: [{ id: "loc", creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
      inventory_levels: [],
      shipping_profiles: [],
      shipping_zones: [],
      shipping_rates: [],
      shipping_packages: [],
      store_settings: [{ creator_id: SHOP, currency: "USD", default_country: "RO" }],
      coupons: [codeRow(min)],
      store_offers: [bundle],
      product_collections: [],
      product_collection_items: [],
      creators: [{ id: SHOP, display_name: "Shop", stripe_account_id: null, charges_enabled: false }],
    })
  }
  const items = readItems([{ productId: A, variantId: "c4100000-0000-4000-8000-0000000000d1", quantity: 1 }, { productId: B, variantId: "c4100000-0000-4000-8000-0000000000d2", quantity: 1 }])
  const shipOver = await priceCheckout(physical(5000) as never, { items, shopId: SHOP, couponCode: "BIG" })
  const shipUnder = await priceCheckout(physical(5500) as never, { items, shopId: SHOP, couponCode: "BIG" })
  check("physical: a $50 minimum is met by $50.40 after the bundle", shipOver.ok === true && (shipOver as { coupon?: { code: string } | null }).coupon?.code === "BIG", shipOver)
  /* Changed on purpose (round 41): this cart used to pass here ($56 before the bundle) and fail in the basket. */
  check("physical: a $55 minimum is not, as in the basket", shipUnder.ok === false && /at least \$55\.00/.test((shipUnder as { error: string }).error), shipUnder)
  check("both checkouts call the one helper", /couponMinimumError\(c, remaining, applies, minimumCurrency\)/.test(read("lib/physical/checkout-pricing-server.ts")) && /couponMinimumError\(c, lines\.map\(\(l\) => l\.cents\), applies, opts\.currency\)/.test(read("lib/checkout/coupons.ts")))
}

function lowStock() {
  console.log("\n5. Low stock includes zero\n")
  const row = { trackInventory: true, lowStockThreshold: 5 }
  const at = (available: number) => ({ available, incoming: 0 })
  check("Low: at or under the line, 0 and oversold included, as the email lists them", inInventoryView(row, at(0), "low") && inInventoryView(row, at(3), "low") && inInventoryView(row, at(-2), "low") && !inInventoryView(row, at(6), "low"))
  check("Out stays its own view: zero or less only", inInventoryView(row, at(0), "out") && inInventoryView(row, at(-1), "out") && !inInventoryView(row, at(3), "out"))
  check("an untracked item is never low or out", !inInventoryView({ trackInventory: false, lowStockThreshold: 5 }, at(0), "low") && !inInventoryView({ trackInventory: false, lowStockThreshold: 5 }, at(0), "out"))
  check("the Inventory page uses the shared rule, and the email still links to ?filter=low", /inInventoryView\(r, l, v\)/.test(read("app/(storelib)/app/inventory/inventory-client.tsx")) && /\/app\/inventory\?filter=low/.test(read("lib/physical/jobs-server.ts")))
}

async function main() {
  await communityMoney()
  collectionsArePages()
  editProfile()
  await couponMinimum()
  lowStock()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

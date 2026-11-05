/**
 * THE ANALYTICS PAGE AS A SELLER OPENS IT, WITH A SERVER THAT TAKES ITS TIME.
 *
 * The real AnalyticsClient, every read answered from fixtures after a delay
 * the probe sets (scripts/check-analytics-tabs.mjs):
 *
 *   /api/analytics/reports        lib/analytics/reports, from the rows below
 *   /api/analytics/commerce       lib/analytics/commerce, from the same orders
 *   /api/analytics/layout         the seller's added reports, recorded
 *   /api/app/community/<id>/...   a community's figures
 *
 * A seller with a creator page, a OnePage, a published website, digital and
 * physical products and one community, so every section the page can draw
 * is drawn. `?delay=` sets the reports' delay in ms (default 700), and the
 * sales reports answer 200ms after them, as the two routes do.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsClient } from "@/app/(storelib)/app/analytics/analytics-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { REMOVED_PRODUCT, buildReports, moneyOf, salesFor, wireFromRows, type StepRow, type ViewRow } from "@/lib/analytics/reports"
import { productSalesSeries, rowSeriesOf, storedDimOf, storedRowSeries, type RowDim } from "@/lib/analytics/row-series"
import { commerceReport } from "@/lib/analytics/commerce"
import { parseMode } from "@/lib/analytics/sections"
import { grainFor } from "@/lib/analytics/buckets"
import { parseProperty, type CreatorProperties } from "@/lib/analytics/properties"
import type { OrderRow } from "@/lib/orders/order-view"

const DAY = 86_400_000
const now = Date.now()
const params = new URLSearchParams(location.search)
const OP = "00000000-0000-4000-8000-00000000000a"
const W1 = "00000000-0000-4000-8000-0000000000b1"
const PLACES: CreatorProperties = { onePageId: OP, websites: [{ id: W1, name: "Studio", published: true }], defaultWebsite: W1 }
const COMMUNITIES = [{ id: "00000000-0000-4000-8000-0000000000c1", name: "Darkroom club", slug: "darkroom" }]

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

const PRODUCTS = [
  { id: "p1", title: "Lightroom preset pack", type: "digital" },
  { id: "p2", title: "Printed zine", type: "physical" },
  { id: "p3", title: "Portrait course", type: "course" },
  { id: "p4", title: "Darkroom club", type: "community" },
]
const PAGES: Record<string, string[]> = { creator_page: ["/ana", "/ana/presets", "/ana/zine"], onepage: ["/ana/links"], w1: ["/", "/about", "/products/presets", "/products/zine"] }
const PAGE_PRODUCT: Record<string, string> = { "/ana/presets": "p1", "/ana/zine": "p2", "/products/presets": "p1", "/products/zine": "p2" }

const views: ViewRow[] = []
const steps: StepRow[] = []
const orders: OrderRow[] = []
for (let i = 0; i < 1600; i++) {
  const t = now - 120 * DAY * Math.pow(rnd(), 1.4)
  const place = pick(["creator_page", "onepage", "w1", "w1"])
  const who = `v${Math.floor(rnd() * 900)}`
  for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
    const path = pick(PAGES[place])
    const at = t + k * 60_000
    views.push({
      id: `e${i}-${k}`, session_id: `s${i}`, visitor_id: who, created_at: new Date(at).toISOString(),
      property_type: place === "w1" ? "website" : place, property_id: place === "onepage" ? OP : place === "w1" ? W1 : null,
      path, product_id: PAGE_PRODUCT[path] ?? null, source_category: pick(["direct", "social_instagram", "organic_search", "referral"]),
      referrer_domain: pick(["Direct", "l.instagram.com", "www.google.com"]), country_code: pick(["RO", "US", "DE"]),
      device_type: rnd() < 0.6 ? "mobile" : "desktop", browser: pick(["Safari", "Chrome"]), os: pick(["iOS", "Android", "macOS"]),
      page_url: place === "w1" ? `https://anashop.com${path}` : `https://storelib.com${path}`,
    })
    if (place === "onepage" && rnd() < 0.5) steps.push({ id: `c${i}-${k}`, event_type: "link_click", session_id: `s${i}`, visitor_id: who, property_type: "onepage", property_id: OP, link_id: "b1", created_at: new Date(at + 5000).toISOString() })
    const product = PAGE_PRODUCT[path]
    if (product && rnd() < 0.3) {
      steps.push({ id: `k${i}-${k}`, event_type: "checkout_start", session_id: `s${i}`, visitor_id: who, product_id: product, property_type: place === "w1" ? "website" : place, property_id: place === "w1" ? W1 : null, created_at: new Date(at + 9000).toISOString() })
      if (rnd() < 0.6) {
        orders.push({
          id: `o${i}-${k}`, product_id: product, amount_cents: product === "p2" ? 2400 : 1900, status: i % 19 === 0 ? "refunded" : "completed",
          created_at: new Date(at + 20_000).toISOString(), source: place === "w1" ? "website" : "storelib",
          property_type: place === "w1" ? "website" : place, property_id: place === "w1" ? W1 : place === "onepage" ? OP : null, buyer_email: `${who}@x.test`,
        } as OrderRow)
      }
    }
  }
}

type W = Window & { __fetches: Array<{ at: number; url: string; method: string; body?: string }>; __delay: number }
const w = window as unknown as W
w.__fetches = []
w.__delay = Number(params.get("delay") || 700)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const titles = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.title]))
const types = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.type]))

w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method || "GET").toUpperCase()
  w.__fetches.push({ at: performance.now(), url, method, body: typeof init?.body === "string" ? init.body : undefined })
  const u = new URL(url, location.href)
  const q = u.searchParams
  if (u.pathname.endsWith("/api/analytics/layout")) return new Response(null, { status: 204 })
  if (u.pathname.startsWith("/api/app/community/")) {
    await new Promise((r) => setTimeout(r, w.__delay))
    const f = (value: number, previous: number) => ({ value, previous })
    /* Round 43: the whole answer's shape (lib/communities/analytics-report CommunityReport), so Communities on their own draw their lines and lists. */
    const days = Math.max(1, Math.round((Date.parse(q.get("end") || "") - Date.parse(q.get("start") || "")) / 86_400_000))
    const l = (xs: (i: number) => number) => ({ current: Array.from({ length: days }, (_, i) => xs(i)), previous: Array.from({ length: days }, (_, i) => Math.max(0, Math.round(xs(i) * 0.85))) })
    return json({
      version: 2, grain: "day", buckets: days,
      figures: { members: f(412, 380), joined: f(38, 29), left: f(6, 9), churn: f(1.6, 2.4), visits: f(1260, 1100), prospects: f(800, 700), joinRate: f(3.1, 2.6), active: f(164, 150), engagement: f(21.4, 19.8), posts: f(57, 44), comments: f(212, 180), reactions: f(640, 512), rsvps: f(0, 0), lessons: f(0, 0) },
      lines: { members: l((i) => 380 + i * 5), joined: l((i) => 3 + (i % 4)), left: l((i) => i % 2), active: l((i) => 40 + (i % 5) * 6), posts: l((i) => 5 + (i % 3) * 2), comments: l((i) => 20 + i), reactions: l((i) => 60 + i * 3), visits: l((i) => 150 + i * 10) },
      money: { currency: "usd", figures: { revenue: f(184000, 151000), mrr: f(52000, 48000), subscribers: f(31, 28), newPaid: f(6, 4), cancellations: f(2, 3) }, lines: { revenue: l((i) => 20000 + (i % 3) * 8000), mrr: l((i) => 48000 + i * 600), subscribers: l((i) => 28 + Math.floor(i / 2)) }, upgrades: 2, churnRate: 7.1, refunds: { count: 1, totalCents: 2500 }, bySource: [{ key: "memberships", cents: 164000 }, { key: "tickets", cents: 20000 }], byPlan: [{ key: "plan-m", label: "Monthly", cents: 124000, paying: 24 }, { key: "plan-y", label: "Yearly", cents: 40000, paying: 7 }], reasons: [{ reason: "too_expensive", count: 1 }] },
      live: { members: 412, active1: 31, active7: 98, active30: 164, stickiness: 18.9 },
      joins: { bySource: [{ key: "free", label: "free", value: 22 }, { key: "subscription", label: "subscription", value: 10 }, { key: "invite", label: "invite", value: 6 }], invites: [] },
      leaveReasons: [{ reason: "too_busy", count: 3 }],
      topSpaces: [{ id: "sp1", name: "Show and tell", slug: "show", posts: 21, comments: 96 }, { id: "sp2", name: "Film stocks", slug: "film", posts: 14, comments: 51 }, { id: "sp3", name: "Help", slug: "help", posts: 9, comments: 30 }],
      topPosts: [{ id: "po1", title: "First roll through the Leica", reactions: 48, comments: 19 }, { id: "po2", title: "Pushing HP5 to 1600", reactions: 31, comments: 22 }],
    })
  }
  const commerce = u.pathname.endsWith("/api/analytics/commerce")
  await new Promise((r) => setTimeout(r, w.__delay + (commerce ? 200 : 0)))
  const selector = parseProperty(q.get("property"))
  const wanted = q.get("product")
  const product = wanted && wanted !== "all" && titles[wanted] ? wanted : null
  /* The Digital / Physical switch narrows the orders to that kind, as the routes do (scripts/check-analytics-drill.mjs switches it). */
  const kind = parseMode(q.get("kind"))
  const ofKind = kind === "physical" ? orders.filter((o) => types[o.product_id as string] === "physical") : kind === "digital" ? orders.filter((o) => types[o.product_id as string] !== "physical") : orders
  const mine = product ? ofKind.filter((o) => o.product_id === product) : ofKind
  if (commerce) {
    const start = Number(q.get("from") || Date.parse(q.get("start") || ""))
    const end = Number(q.get("to") || Date.parse(q.get("end") || ""))
    /* As the route reads them: ms, or an ISO date. */
    const at = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : Date.parse(v || ""))
    const cs = q.get("cstart")
    const previous = cs ? { start: at(cs), end: at(q.get("cend")) } : q.get("compare") === "none" ? { start, end: start } : { start: start - (end - start), end: start }
    /* Round AB2: the route's own counting, payment by payment (lib/analytics/commerce commerceReport). */
    const c = commerceReport({ rows: mine, span: { start, end }, previous: q.get("compare") === "none" ? null : previous, timeZone: q.get("tz") || "UTC", selector, properties: PLACES, productId: null, mode: parseMode(q.get("kind")), productTypes: types })
    return json({
      ...c, orders: undefined,
      currency: "USD", grain: grainFor({ start, end }), timeZone: q.get("tz") || "UTC",
      fulfillment: { hours: 30, shipped: 12 }, fulfillmentBefore: { hours: 34, shipped: 9 }, compared: q.get("compare") !== "none", viewer: "u1",
    })
  }
  const window_ = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
  const cs = q.get("cstart")
  const previous = cs ? { start: Date.parse(cs), end: Date.parse(q.get("cend")!) } : null
  const timeZone = q.get("tz") || "UTC"
  /* An opened report's own lines (app/api/analytics/rows), counted from the same rows by the route's rules (lib/analytics/row-series). */
  if (u.pathname.endsWith("/api/analytics/rows")) {
    const dim = q.get("dim") as RowDim
    const series = dim === "product"
      ? productSalesSeries({ orders: mine, window: window_, timeZone, selector, defaultWebsite: PLACES.defaultWebsite, productTitles: titles, productTypes: types, mode: kind, removedKey: REMOVED_PRODUCT })
      : rowSeriesOf(dim, storedRowSeries({ views, steps, window: window_, timeZone, selector, defaultWebsite: PLACES.defaultWebsite, product, dim: storedDimOf(dim) }), "storelib.com")
    return json({ dim, series, truncated: false })
  }
  const wire = wireFromRows({ views, steps, window: window_, previous, timeZone, selector, defaultWebsite: PLACES.defaultWebsite, product, mainDomain: "storelib.com" })
  const reports = buildReports({ orders: mine, window: window_, previous, timeZone, mainDomain: "storelib.com", productTitles: titles, productTypes: types, selector, properties: PLACES, product, wire, linkLabels: { b1: "Shop my presets" } })
  const sales = salesFor(mine, { type: "all" }, PLACES.defaultWebsite)
  const allTime = selector.type === "all" && !product ? { orders: sales.length, salesCents: sales.reduce((n, o) => n + moneyOf(o).net, 0) } : null
  return json({ reports, allTime, truncated: false, viewer: "u1", property: q.get("property") || "all", properties: PLACES })
}) as typeof fetch

/* What the server page hands the client: the places, the products with their kinds, the communities, and the reports this seller added. */
const extra = {
  communities: COMMUNITIES,
  savedReports: params.get("saved") === "none" ? null : ["pageviews", "clicks"],
}
const Client = AnalyticsClient as unknown as React.ComponentType<Record<string, unknown>>
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    {/* `?physical=1`: physical commerce on, so the kind chips show all four (scripts/check-analytics-mobile-row.mjs). */}
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce={params.get("physical") === "1"}>
      <div style={{ height: "100vh" }}>
        <Client creatorId="c1" userId="u1" products={PRODUCTS} properties={PLACES} {...extra} />
      </div>
    </PlatformSettingsProvider>
  </LanguageProvider>,
)

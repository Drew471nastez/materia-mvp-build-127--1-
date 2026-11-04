/**
 * THE ANALYTICS PAGE, WHOLE, WITH A SERVER THAT ANSWERS FROM FIXTURES.
 *
 * The real AnalyticsClient: the period picker, the property filter, the
 * product picker, the four figures, the chart and the reports. What stands
 * in for the network is a fetch that builds the answer with the same rules
 * the server uses (lib/analytics/reports wireFromRows and buildReports) from
 * two months of made-up visits on a creator page, a OnePage and two
 * websites, orders and sign-ups, after a delay the probe sets, and counts
 * every request. It answers /api/analytics/summary the same way, for the
 * summary lines (`?view=summary`).
 *
 * What stands in for Next is a router that records what it is asked to do
 * (a replace or a refresh is a server round trip in the real app, and a
 * remount of the page under its loading skeleton) and search params read
 * from the address.
 *
 *   ?places=one     a creator with only a creator page: no property filter
 *   ?products=many  fourteen products: the product picker's search
 *   ?empty=1        a creator with nothing yet: every card's empty state
 *   ?view=summary   the Website screen's and the OnePage editor's summary lines
 *   ?seller=digital | physical | both | none
 *                   what the store sells (round AB2): the products' kinds, so
 *                   the page morphs; the sales reports and the export are
 *                   answered from the same fixtures (lib/analytics/commerce
 *                   commerceReport, lib/analytics/export-csv)
 *
 * scripts/check-analytics-page.mjs drives it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsClient } from "@/app/app/analytics/analytics-client"
import { AnalyticsSummaryFact, AnalyticsSummaryLine } from "@/components/app/analytics-summary-line"
import { LanguageProvider } from "@/lib/i18n/context"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { RouterPullToRefresh } from "@/components/ui/pull-to-refresh"
import { buildReports, moneyOf, salesFor, wireFromRows, type StepRow, type SubscriberRow, type ViewRow } from "@/lib/analytics/reports"
import { parseProperty, type CreatorProperties } from "@/lib/analytics/properties"
import { summaryHref } from "@/lib/analytics/summary"
import type { OrderRow } from "@/lib/orders/order-view"
import { commerceReport } from "@/lib/analytics/commerce"
import { analyticsCsv, analyticsFiles, parseExportReports } from "@/lib/analytics/export-csv"
import JSZip from "jszip"
import { modeFor, parseMode, profileOf, sectionsFor } from "@/lib/analytics/sections"

const DAY = 86_400_000
const now = Date.now()
const params = new URLSearchParams(location.search)
const empty = params.get("empty") === "1"
const SOURCES = ["direct", "social_instagram", "social_tiktok", "organic_search", "referral", "email"]
const REFERRERS = ["Direct", "l.instagram.com", "tiktok.com", "www.google.com", "blog.example.org", "Direct"]
const COUNTRIES = ["RO", "US", "GB", "DE", "IN"]
const OP = "00000000-0000-4000-8000-00000000000a"
const W1 = "00000000-0000-4000-8000-0000000000b1"
const W2 = "00000000-0000-4000-8000-0000000000b2"
const PLACES: CreatorProperties =
  params.get("places") === "one" ? { onePageId: null, websites: [], defaultWebsite: null } : { onePageId: OP, websites: [{ id: W1, name: "Studio" }, { id: W2, name: "Print shop" }], defaultWebsite: W1 }

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

const SELLER = params.get("seller")
const KIND: Record<string, string> = SELLER === "physical" ? { p1: "physical", p2: "physical", p3: "physical", p4: "physical" } : SELLER === "both" ? { p1: "digital", p2: "physical", p3: "digital", p4: "physical" } : { p1: "digital", p2: "digital", p3: "digital", p4: "digital" }
const PRODUCTS = SELLER === "none" ? [] : [
  { id: "p1", title: "Lightroom preset pack", type: KIND.p1 },
  { id: "p2", title: "Brush set for Procreate", type: KIND.p2 },
  { id: "p3", title: "Portrait course", type: KIND.p3 },
  { id: "p4", title: "Wallpaper bundle", type: KIND.p4 },
]
const TYPES: Record<string, string | null> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.type]))
const PLACE_PAGES: Record<string, string[]> = {
  creator_page: ["/ana", "/ana/presets", "/ana/brushes", "/ana/course"],
  onepage: ["/ana/links"],
  w1: ["/", "/about", "/products/presets", "/products/course", "/contact"],
  w2: ["/", "/shop", "/products/wallpapers"],
}
const PAGE_PRODUCT: Record<string, string> = { "/ana/presets": "p1", "/ana/brushes": "p2", "/ana/course": "p3", "/products/presets": "p1", "/products/course": "p3", "/products/wallpapers": "p4" }

const views: ViewRow[] = []
const steps: StepRow[] = []
const orders: OrderRow[] = []
const subscribers: SubscriberRow[] = []
if (!empty) {
  for (let i = 0; i < 1400; i++) {
    const t = now - 400 * DAY * Math.pow(rnd(), 1.6)
    const place = PLACES.onePageId ? pick(["creator_page", "creator_page", "onepage", "w1", "w1", "w2"]) : "creator_page"
    const s = Math.floor(rnd() * SOURCES.length)
    const who = `v${Math.floor(rnd() * 900)}`
    const pages = 1 + Math.floor(rnd() * 3)
    for (let k = 0; k < pages; k++) {
      const path = pick(PLACE_PAGES[place])
      views.push({
        id: `e${i}-${k}`,
        session_id: `s${i}`,
        visitor_id: who,
        created_at: new Date(t + k * 90_000).toISOString(),
        property_type: place.startsWith("w") ? "website" : place,
        property_id: place === "onepage" ? OP : place === "w1" ? W1 : place === "w2" ? W2 : null,
        path,
        product_id: PAGE_PRODUCT[path] ?? null,
        source_category: SOURCES[s],
        referrer_domain: REFERRERS[s],
        country_code: pick(COUNTRIES),
        device_type: rnd() < 0.62 ? "mobile" : rnd() < 0.9 ? "desktop" : "tablet",
        browser: pick(["Safari", "Chrome", "Chrome", "Instagram", "Firefox"]),
        page_url: place.startsWith("w") ? `https://anashop.com${path}` : `https://storelib.com${path}`,
        utm_campaign: s === 5 ? "autumn-launch" : null,
      })
      if (place === "onepage" && rnd() < 0.6) {
        steps.push({ id: `c${i}-${k}`, event_type: "link_click", session_id: `s${i}`, visitor_id: who, property_type: "onepage", property_id: OP, link_id: pick(["b1", "b2", "b3"]), created_at: new Date(t + k * 90_000 + 20_000).toISOString() })
      }
      if (PAGE_PRODUCT[path] && rnd() < 0.25) {
        steps.push({ id: `k${i}-${k}`, event_type: "checkout_start", session_id: `s${i}`, visitor_id: who, product_id: PAGE_PRODUCT[path], property_type: place.startsWith("w") ? "website" : place, property_id: place === "w1" ? W1 : place === "w2" ? W2 : null, created_at: new Date(t + k * 90_000 + 40_000).toISOString() })
        if (rnd() < 0.55 && SELLER !== "none") {
          orders.push({
            id: `o${i}-${k}`,
            product_id: PAGE_PRODUCT[path],
            amount_cents: [1200, 2900, 4900, 0][Math.floor(rnd() * 4)],
            status: i % 17 === 0 ? "refunded" : "completed",
            created_at: new Date(t + k * 90_000 + 60_000).toISOString(),
            source: place.startsWith("w") ? "website" : "storelib",
            buyer_email: `buyer${Math.floor(rnd() * 60)}@example.com`,
            checkout_id: KIND[PAGE_PRODUCT[path]] === "physical" ? `ck${i}-${k}` : null,
            property_type: place.startsWith("w") ? "website" : place,
            property_id: place === "w1" ? W1 : place === "w2" ? W2 : place === "onepage" ? OP : "c1",
          })
        }
      }
    }
    if (rnd() < 0.08) {
      subscribers.push({ id: `sub${i}`, subscribed_at: new Date(t + 30_000).toISOString(), property_type: place.startsWith("w") ? "website" : place, property_id: place === "w2" ? W2 : place === "w1" ? W1 : null, last_touch: { source: SOURCES[s] } })
    }
  }
}

type W = Window & {
  __fetches: Array<{ at: number; url: string }>
  __delay: number
  /** How long after the figures the rest of a streamed answer comes (app/api/analytics/reports `stream=1`). */
  __listsDelay: number
  /** Take the page away and put it back, as leaving Analytics and coming back does. */
  __remount: () => void
  __nav: Array<[string, string?]>
  __tick?: () => void
}
const w = window as unknown as W
w.__fetches = []
/* ?delay=<ms>: how long every answer takes (round 51: the empty-state probe reads each card while it waits). */
w.__delay = Number(params.get("delay")) || 120
w.__listsDelay = 0
w.__nav = []

/*
  THE MINUTE. The page asks again every sixty seconds; the probe cannot wait
  a minute, so the sixty second interval is handed to it as __tick.
*/
const realSetInterval = window.setInterval.bind(window)
window.setInterval = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
  if (ms === 60_000) {
    w.__tick = fn
    return 0
  }
  return realSetInterval(fn, ms, ...(rest as []))
}) as typeof window.setInterval

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const titles = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.title]))

w.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input)
  w.__fetches.push({ at: performance.now(), url })
  await new Promise((r) => setTimeout(r, w.__delay))
  const u = new URL(url, location.href)
  const q = u.searchParams
  /* Analytics › Send to (round 49): GA4 connected, nothing else; answered after the same delay as the rest. */
  if (u.pathname.endsWith("/api/analytics/destinations")) {
    const none = (provider: string) => ({ provider, connected: false, label: null, hint: null, testEventCode: null, lastSentAt: null, lastEvent: null, waiting: 0, errors: [], log: [] })
    return json({ ready: true, canEdit: true, destinations: [{ ...none("ga4"), connected: true, label: "G-8KQ2LM4XYZ", hint: "x9Qa", lastSentAt: new Date(now - 3 * 60_000).toISOString(), lastEvent: "purchase" }, none("meta"), none("posthog"), none("webhook")] })
  }
  const selector = parseProperty(q.get("property"))
  /* As the server does: a place the creator does not have is nothing at all. */
  const known = selector.type === "all" || selector.type === "creator_page" || (selector.type === "onepage" && !!PLACES.onePageId) || (selector.type === "website" && PLACES.websites.some((x) => x.id === selector.id))
  if (!known) return json({ error: "No such property" }, 404)

  if (u.pathname.endsWith("/api/analytics/summary")) {
    const window_ = { start: now - 30 * DAY, end: now }
    const wire = wireFromRows({ views, steps, window: window_, previous: null, timeZone: "UTC", selector, defaultWebsite: PLACES.defaultWebsite, product: null, mainDomain: "storelib.com" })
    const sold = salesFor(orders, selector, PLACES.defaultWebsite).filter((o) => Date.parse(o.createdAt) >= window_.start)
    return json({ visitors: wire.cur.visitors ?? 0, orders: sold.length, href: summaryHref(selector), viewer: "u1" })
  }

  /* The sales reports and the export, from the same orders by the same rules as the server (round AB2). */
  if (u.pathname.endsWith("/api/analytics/commerce") || u.pathname.endsWith("/api/analytics/export")) {
    const exporting = u.pathname.endsWith("/api/analytics/export")
    const span = exporting ? { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) } : { start: Number(q.get("from")), end: Number(q.get("to")) }
    const cs2 = q.get("cstart")
    const previous = cs2 ? (exporting ? { start: Date.parse(cs2), end: Date.parse(q.get("cend")!) } : { start: Number(cs2), end: Number(q.get("cend")) }) : null
    const tz = q.get("tz") || "UTC"
    const profile = profileOf({ products: PRODUCTS, onePageId: PLACES.onePageId, websites: PLACES.websites, communities: 0 })
    const mode = modeFor(profile, parseMode(q.get("kind")))
    const wanted = q.get("product")
    const productId = wanted && wanted !== "all" && titles[wanted] ? wanted : null
    const checkouts = Object.fromEntries(orders.filter((o) => o.checkout_id).map((o, i) => [o.checkout_id!, i % 3 === 0 ? "unfulfilled" : "fulfilled"]))
    const c = commerceReport({ rows: orders, span, previous, timeZone: tz, selector, properties: PLACES, productId, mode, productTypes: TYPES, checkouts })
    const commerce = { ...c, currency: "USD", grain: span.end - span.start <= 2 * DAY ? "hour" : span.end - span.start <= 92 * DAY ? "day" : "month", timeZone: tz, compared: !!previous, truncated: false, unconverted: 0, fulfillment: { hours: 30, shipped: 4 }, fulfillmentBefore: { hours: 36, shipped: 3 }, placeUnknown: false, viewer: "u1" }
    if (!exporting) return json({ ...commerce, orders: undefined })
    const mine2 = productId ? orders.filter((o) => o.product_id === productId) : orders
    const reports = buildReports({ views, steps, orders: mine2, subscribers, window: span, previous, timeZone: tz, mainDomain: "storelib.com", productTitles: titles, selector, properties: PLACES, product: productId, productTypes: TYPES, mode })
    const sections = sectionsFor(profile, { property: q.get("property") || "all", productKind: null, mode })
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    /* The route's own choices (round AC2): the reports asked for, one CSV or a zip with a CSV per report. */
    const input = { meta: { store: "Ana", from: day(span.start), to: day(span.end - 1), comparedFrom: previous ? day(previous.start) : null, comparedTo: previous ? day(previous.end - 1) : null, timeZone: tz, place: "All pages", sales: mode, currency: "USD", madeAt: new Date().toISOString() }, reports, commerce: commerce as never, sections, timeZone: tz, only: parseExportReports(q.get("reports")) }
    if (q.get("format") === "zip") {
      const zip = new JSZip()
      for (const f of analyticsFiles(input)) zip.file(f.name, `\uFEFF${f.csv}`)
      return new Response(await zip.generateAsync({ type: "blob" }), { status: 200, headers: { "content-type": "application/zip" } })
    }
    return new Response(`\uFEFF${analyticsCsv(input)}`, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } })
  }

  const window_ = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
  const cs = q.get("cstart")
  const previous = cs ? { start: Date.parse(cs), end: Date.parse(q.get("cend")!) } : null
  const timeZone = q.get("tz") || "UTC"
  const wanted = q.get("product")
  const product = wanted && wanted !== "all" && titles[wanted] ? wanted : null
  const mine = product ? orders.filter((o) => o.product_id === product) : orders
  const wire = wireFromRows({ views, steps, window: window_, previous, timeZone, selector, defaultWebsite: PLACES.defaultWebsite, product, mainDomain: "storelib.com" })
  const kind = modeFor(profileOf({ products: PRODUCTS, onePageId: PLACES.onePageId, websites: PLACES.websites, communities: 0 }), parseMode(q.get("kind")))
  const base = { orders: mine, window: window_, previous, timeZone, mainDomain: "storelib.com", productTitles: titles, selector, properties: PLACES, product, linkLabels: { b1: "Shop my presets", b2: "YouTube", b3: "Instagram" }, productTypes: TYPES, mode: kind }
  const reports = buildReports({ ...base, wire, subscribers: product ? undefined : subscribers })
  const sales = salesFor(mine, { type: "all" }, PLACES.defaultWebsite)
  const allTime = selector.type === "all" && !product ? { orders: sales.length, salesCents: sales.reduce((n, o) => n + moneyOf(o).net, 0) } : null
  const answer = { reports, allTime, truncated: false, viewer: "u1", property: q.get("property") || "all", properties: PLACES }
  if (!q.has("stream")) return json(answer)
  /* As the server streams it: the figures, counted without the lists, then everything. */
  const only = (x: typeof wire.cur) => ({ visitors: x.visitors, views: x.views, product_visitors: x.product_visitors, product_views: x.product_views, visitor_buckets: x.visitor_buckets, view_buckets: x.view_buckets, clicks: x.clicks, click_buckets: x.click_buckets })
  const figures = { part: "figures", ...answer, reports: buildReports({ ...base, wire: { cur: only(wire.cur), prev: only(wire.prev) } }) }
  const enc = new TextEncoder()
  const body = new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(JSON.stringify(figures) + "\n"))
      await new Promise((r) => setTimeout(r, w.__listsDelay))
      c.enqueue(enc.encode(JSON.stringify({ part: "all", ...answer }) + "\n"))
      c.close()
    },
  })
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } })
}) as typeof fetch

const many = params.get("products") === "many"
const products = many
  ? Array.from({ length: 14 }, (_, i) => ({ id: `p${i + 1}`, title: PRODUCTS[i % 4].title + (i >= 4 ? ` ${Math.floor(i / 4) + 1}` : "") }))
  : PRODUCTS

/* The two screens the summary lines sit on, as much of them as frames the line: the live website's facts and the OnePage's links. */
const summaries = () => (
  <div className="min-h-screen bg-[#f8f9fa]">
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-probe-website="">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Studio</h2>
        <dl className="mt-4 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
          <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-[#6b7280]">Published</dt><dd className="text-right font-medium text-[#1a1a2e]">3 weeks ago</dd></div>
          <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-[#6b7280]">Last edited</dt><dd className="text-right font-medium text-[#1a1a2e]">2 days ago</dd></div>
          <AnalyticsSummaryFact property={`website:${W1}`} />
        </dl>
      </section>
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-probe-onepage="">
        <AnalyticsSummaryLine property="onepage" className="mb-3" />
        <div className="rounded-xl border border-[#e5e7eb] px-4 py-3 text-[14px] text-[#1a1a2e]">Shop my presets</div>
      </section>
    </div>
  </div>
)

const page = () =>
  params.get("view") === "summary" ? (
    summaries()
  ) : (
    <LanguageProvider>
      {/* ?physical=1: physical commerce switched on for the platform, so a store that sells both has the type picker (round 51). */}
      <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce={params.get("physical") === "1"}>
      <div style={{ height: "100vh" }}>
        {/* ?outer=1: the pull wrapped round the whole page, as page.tsx did before round 12, for scripts/check-analytics-pull.mjs to compare. */}
        {params.get("outer") === "1" ? (
          <RouterPullToRefresh scope="app-analytics" fill>
            <AnalyticsClient creatorId="c1" userId="u1" products={products} properties={PLACES} />
          </RouterPullToRefresh>
        ) : (
          <AnalyticsClient creatorId="c1" userId="u1" products={products} properties={PLACES} />
        )}
      </div>
      </PlatformSettingsProvider>
    </LanguageProvider>
  )
let root = createRoot(document.getElementById("app")!)
root.render(page())
w.__remount = () => {
  root.unmount()
  root = createRoot(document.getElementById("app")!)
  root.render(page())
}

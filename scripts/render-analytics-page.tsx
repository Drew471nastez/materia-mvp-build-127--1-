/**
 * THE ANALYTICS PAGE, WHOLE, WITH A SERVER THAT ANSWERS FROM FIXTURES.
 *
 * The real AnalyticsClient: the period picker, the product picker, the Store
 * and One page switch, the four figures, the chart and the reports. What
 * stands in for the network is a fetch that builds the answer with the same
 * rules the server uses (lib/analytics/reports) from two months of made-up
 * visits and orders, after a delay the probe sets, and counts every request.
 *
 * What stands in for Next is a router that records what it is asked to do
 * (a replace or a refresh is a server round trip in the real app, and a
 * remount of the page under its loading skeleton) and search params read
 * from the address.
 *
 * scripts/check-analytics-page.mjs drives it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsClient } from "@/app/app/analytics/analytics-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { buildOnePageReports, buildReports, tallyVisits, type OnePageViewRow, type ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

const DAY = 86_400_000
const now = Date.now()
const SOURCES = ["direct", "social_instagram", "social_tiktok", "organic_search", "referral", "email"]
const COUNTRIES: Array<[string, string, string]> = [["RO", "Romania", "Bucharest"], ["US", "United States", "New York"], ["GB", "United Kingdom", "London"], ["DE", "Germany", "Berlin"]]

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const views: ViewRow[] = []
for (let i = 0; i < 1600; i++) {
  const t = now - 400 * DAY * Math.pow(rnd(), 1.6)
  const s = Math.floor(rnd() * SOURCES.length)
  const c = COUNTRIES[Math.floor(rnd() * COUNTRIES.length)]
  views.push({
    session_id: `s${i}`,
    visitor_id: `v${i % 1100}`,
    created_at: new Date(t).toISOString(),
    source_category: SOURCES[s],
    referrer_domain: "Direct",
    country_code: c[0],
    country_name: c[1],
    city: c[2],
    device_type: rnd() < 0.6 ? "mobile" : "desktop",
    browser: "Safari",
    os: "iOS",
    page_url: rnd() < 0.5 ? "https://ana.storelib.com/" : "https://storelib.com/ana",
    utm_campaign: null,
  })
}
const PRODUCTS = [
  { id: "p1", title: "Lightroom preset pack" },
  { id: "p2", title: "Brush set for Procreate" },
  { id: "p3", title: "Portrait course" },
  { id: "p4", title: "Wallpaper bundle" },
]
const orders: OrderRow[] = []
for (let i = 0; i < 160; i++) {
  const t = now - 400 * DAY * Math.pow(rnd(), 1.6)
  orders.push({
    id: `o${i}`,
    product_id: PRODUCTS[Math.floor(rnd() * PRODUCTS.length)].id,
    amount_cents: [1200, 2900, 4900, 0][Math.floor(rnd() * 4)],
    status: i % 17 === 0 ? "refunded" : "completed",
    created_at: new Date(t).toISOString(),
    source: rnd() < 0.45 ? "website" : "storelib",
    buyer_country_code: "RO",
    buyer_country: "Romania",
  } as OrderRow)
}
const steps = views.filter((_, i) => i % 9 === 0).map((v) => ({ event_type: "buy_click", session_id: v.session_id, created_at: v.created_at }))
const pageViews: OnePageViewRow[] = views.filter((_, i) => i % 2 === 0).map((v, i) => ({ id: `pv${i}`, visitor_id: v.visitor_id, created_at: v.created_at, referrer: null, user_agent: null }))
const clicks = pageViews.filter((_, i) => i % 3 === 0).map((v) => ({ block_id: "b1", visitor_id: v.visitor_id, created_at: v.created_at }))
const leads = pageViews.filter((_, i) => i % 20 === 0).map((v) => ({ created_at: v.created_at }))

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
w.__delay = 120
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

w.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input)
  w.__fetches.push({ at: performance.now(), url })
  await new Promise((r) => setTimeout(r, w.__delay))
  const q = new URL(url, location.href).searchParams
  const window_ = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
  const cs = q.get("cstart")
  const previous = cs ? { start: Date.parse(cs), end: Date.parse(q.get("cend")!) } : null
  const timeZone = q.get("tz") || "UTC"
  const product = q.get("product")
  if (q.get("mode") === "onepage") {
    const reports = buildOnePageReports({
      views: pageViews, clicks, leads, window: window_, previous, timeZone, mainDomain: "storelib.com",
      linkLabels: { b1: "Instagram" },
      categorize: () => "direct",
      parseAgent: () => ({ device: "mobile", browser: "Safari", os: "iOS" }),
      hostOf: () => "",
    })
    return new Response(JSON.stringify({ reports, allTime: { views: pageViews.length, clicks: clicks.length, subscribers: leads.length }, truncated: false, hasPage: true, viewer: "u1" }), { headers: { "content-type": "application/json" } })
  }
  const mine = product && product !== "all" ? orders.filter((o) => o.product_id === product) : orders
  const base = { orders: mine, window: window_, previous, timeZone, mainDomain: "storelib.com", productTitles: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.title])) }
  const reports = buildReports({ ...base, views, steps })
  const allTime = { views: views.length, orders: mine.length, salesCents: mine.reduce((a, o) => a + (o.amount_cents || 0), 0) }
  const answer = { reports, allTime, truncated: false, viewer: "u1" }
  if (!q.has("stream")) return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } })
  /* As the server streams it: the figures, counted without the lists, then everything. */
  const tallied = tallyVisits({ views, steps, window: window_, previous, timeZone })
  const quick = { cur: { ...tallied.cur, steps: undefined, groups: undefined }, prev: { ...tallied.prev, steps: undefined, groups: undefined } }
  const figures = { part: "figures", reports: buildReports({ ...base, visits: quick }), allTime, truncated: false }
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

const many = new URLSearchParams(location.search).get("products") === "many"
const products = many
  ? Array.from({ length: 14 }, (_, i) => ({ id: `p${i + 1}`, title: PRODUCTS[i % 4].title + (i >= 4 ? ` ${Math.floor(i / 4) + 1}` : "") }))
  : PRODUCTS

const page = () => (
  <LanguageProvider>
    <div style={{ height: "100vh" }}>
      <AnalyticsClient creatorId="c1" userId="u1" products={products} />
    </div>
  </LanguageProvider>
)
let root = createRoot(document.getElementById("app")!)
root.render(page())
w.__remount = () => {
  root.unmount()
  root = createRoot(document.getElementById("app")!)
  root.render(page())
}

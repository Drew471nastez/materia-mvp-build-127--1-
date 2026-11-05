/**
 * The real AnalyticsReports with the real report rules behind it: a month of
 * made-up visits and orders run through lib/analytics/reports.ts, served to
 * the cards by a stand-in for /api/analytics/reports that answers late on
 * purpose, so scripts/check-analytics-reports.mjs can see the loading state.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsReports } from "@/app/(storelib)/app/analytics/analytics-reports"
import { buildReports, type ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

const DAY = 86_400_000
const end = Date.now()
const start = end - 30 * DAY
const SOURCES = ["direct", "social_instagram", "social_tiktok", "organic_search", "referral", "email", "social_facebook"]
const REFS = ["", "instagram.com", "tiktok.com", "www.google.com", "blog.example.com", "mail.google.com", "facebook.com"]
const COUNTRIES: Array<[string, string, string]> = [["RO", "Romania", "Bucharest"], ["US", "United States", "New York"], ["GB", "United Kingdom", "London"], ["DE", "Germany", "Berlin"], ["MD", "Moldova", "Chișinău"], ["FR", "France", "Paris"], ["IT", "Italy", "Rome"], ["ES", "Spain", "Madrid"]]
const DEVICES = ["mobile", "mobile", "desktop", "tablet", "mobile"]
const BROWSERS = ["Safari", "Chrome", "Chrome", "Firefox", "Samsung Internet"]
const OSES = ["iOS", "Android", "macOS", "Windows", "iOS"]

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const views: ViewRow[] = []
for (let i = 0; i < 1400; i++) {
  const t = end - 60 * DAY * Math.pow(rnd(), 0.9)
  const s = Math.floor(rnd() * SOURCES.length)
  const c = COUNTRIES[Math.floor(rnd() * rnd() * COUNTRIES.length)]
  const d = Math.floor(rnd() * DEVICES.length)
  const pages = 1 + Math.floor(rnd() * 3)
  for (let p = 0; p < pages; p++) {
    views.push({
      session_id: `s${i}`,
      visitor_id: `v${i % 900}`,
      created_at: new Date(t + p * 60_000).toISOString(),
      source_category: SOURCES[s],
      referrer_domain: REFS[s] || "Direct",
      country_code: c[0],
      country_name: c[1],
      city: c[2],
      device_type: DEVICES[d],
      browser: BROWSERS[d],
      os: OSES[d],
      page_url: rnd() < 0.4 ? "https://ana.storelib.com/" : rnd() < 0.5 ? "https://storelib.com/ana" : "https://storelib.com/p/presets",
      utm_campaign: rnd() < 0.08 ? "Autumn drop" : null,
    })
  }
}
const orders: OrderRow[] = []
for (let i = 0; i < 90; i++) {
  const t = end - 60 * DAY * rnd()
  const pid = ["p1", "p2", "p3", "p4"][Math.floor(rnd() * 4)]
  orders.push({
    id: `o${i}`,
    product_id: pid,
    amount_cents: [1200, 2900, 4900, 0][Math.floor(rnd() * 4)],
    status: i % 17 === 0 ? "refunded" : "completed",
    created_at: new Date(t).toISOString(),
    source: rnd() < 0.45 ? "website" : "storelib",
    buyer_country_code: COUNTRIES[i % 3][0],
    buyer_country: COUNTRIES[i % 3][1],
  })
}
const steps = views.filter((_, i) => i % 9 === 0).flatMap((v, i) => [
  { event_type: "buy_click", session_id: v.session_id, created_at: v.created_at },
  ...(i % 2 ? [{ event_type: "checkout_start", session_id: v.session_id, created_at: v.created_at }] : []),
])

const reports = buildReports({
  views,
  steps,
  orders,
  window: { start, end },
  timeZone: "Europe/Bucharest",
  mainDomain: "storelib.com",
  productTitles: { p1: "Lightroom preset pack", p2: "Brush set for Procreate", p3: "Portrait course", p4: "Wallpaper bundle" },
})

const w = window as unknown as { __release: () => void; fetch: typeof fetch }
let release: () => void = () => {}
const gate = new Promise<void>((r) => (release = r))
w.__release = release
w.fetch = (async () => {
  await gate
  return new Response(JSON.stringify({ reports, truncated: false }), { headers: { "content-type": "application/json" } })
}) as typeof fetch

createRoot(document.getElementById("app")!).render(
  <div style={{ background: "#fafafa", padding: 16 }}>
    <AnalyticsReports start={new Date(start)} end={new Date(end)} product="all" />
  </div>,
)

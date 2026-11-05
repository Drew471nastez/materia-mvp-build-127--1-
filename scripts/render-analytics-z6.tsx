/**
 * The real Physical sales card and AnalyticsReports, fed by the real report
 * rules (lib/analytics/reports.ts) over a month of made-up visits, carts and
 * orders with every referrer the brand marks cover, for
 * scripts/check-analytics-z6.mjs. The stand-in for the two routes answers
 * at once.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsReports } from "@/app/(storelib)/app/analytics/analytics-reports"
import { PhysicalAnalyticsCard } from "@/components/physical/analytics-card"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { buildReports, type StepRow, type ViewRow } from "@/lib/analytics/reports"
import { categorizeServerSource } from "@/lib/analytics/sources"
import type { OrderRow } from "@/lib/orders/order-view"

const DAY = 86_400_000
const end = Date.now()
const start = end - 30 * DAY
const REFS = ["", "www.google.com", "google.co.uk", "com.google.android.googlequicksearchbox", "l.instagram.com", "lm.facebook.com", "t.co", "github.com", "apps.apple.com", "stripe.com", "bing.com", "duckduckgo.com", "vm.tiktok.com", "youtube.com", "pinterest.com", "old.reddit.com", "linkedin.com", "mail.google.com", "wa.me", "t.me", "discord.com", "snapchat.com", "blog.example.com"]
const OSES = ["iOS", "iOS", "Android", "Windows", "macOS", "Linux", "ChromeOS", "", "Tizen"]
const PATHS: Array<[string, string]> = [["/", "Ana Studio"], ["/products/linen-shirt", "Linen shirt, sand"], ["/products/ceramic-mug-set-of-four-in-matte-glaze", "Ceramic mug set of four in matte glaze"], ["/collections/all", "All products"], ["/products/lightroom-presets", "Lightroom presets"]]
const COUNTRIES = ["RO", "US", "GB", "DE", "FR", "IT"]

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const views: ViewRow[] = []
const steps: StepRow[] = []
for (let i = 0; i < 1600; i++) {
  const t = end - 60 * DAY * Math.pow(rnd(), 0.9)
  const ref = REFS[Math.floor(rnd() * REFS.length)]
  const os = OSES[Math.floor(rnd() * OSES.length)]
  const pages = 1 + Math.floor(rnd() * 3)
  for (let p = 0; p < pages; p++) {
    const [path, title] = PATHS[Math.floor(rnd() * PATHS.length)]
    views.push({
      id: `e${i}-${p}`,
      session_id: `s${i}`,
      visitor_id: `v${i % 1100}`,
      created_at: new Date(t + p * 60_000).toISOString(),
      source_category: categorizeServerSource(ref || "Direct"),
      referrer_domain: ref || "Direct",
      country_code: COUNTRIES[Math.floor(rnd() * rnd() * COUNTRIES.length)],
      device_type: os === "iOS" || os === "Android" ? "mobile" : "desktop",
      browser: os === "iOS" ? "Safari" : "Chrome",
      os,
      property_type: "website",
      property_id: null,
      path,
      page_title: title,
      product_id: path.startsWith("/products/") ? path.slice(10) : null,
    })
  }
  if (rnd() < 0.18) steps.push({ event_type: "buy_click", session_id: `s${i}`, visitor_id: `v${i % 1100}`, created_at: new Date(t + 90_000).toISOString(), property_type: "website" })
  if (rnd() < 0.08) steps.push({ event_type: "checkout_start", session_id: `s${i}`, visitor_id: `v${i % 1100}`, created_at: new Date(t + 120_000).toISOString(), property_type: "website" })
}
const orders: OrderRow[] = []
for (let i = 0; i < 70; i++) {
  const t = end - 60 * DAY * rnd()
  const pid = ["linen-shirt", "ceramic-mug-set-of-four-in-matte-glaze", "lightroom-presets"][Math.floor(rnd() * 3)]
  orders.push({ id: `o${i}`, product_id: pid, amount_cents: pid === "lightroom-presets" ? 1900 : 4900, quantity: 1 + (i % 3), status: i % 13 === 0 ? "refunded" : "completed", created_at: new Date(t).toISOString(), buyer_country_code: COUNTRIES[i % 4] })
}

const reports = buildReports({
  views,
  steps,
  orders,
  window: { start, end },
  timeZone: "Europe/Bucharest",
  mainDomain: "storelib.com",
  productTitles: { "linen-shirt": "Linen shirt", "ceramic-mug-set-of-four-in-matte-glaze": "Ceramic mug set of four", "lightroom-presets": "Lightroom presets" },
  productTypes: { "linen-shirt": "physical", "ceramic-mug-set-of-four-in-matte-glaze": "physical", "lightroom-presets": "digital" },
  downloadsByLine: Object.fromEntries(orders.filter((o, i) => o.product_id === "lightroom-presets" && i % 4 !== 0).map((o) => [o.id, 2])),
})

const physical = {
  orders: 46, netCents: 214_300, averageOrderCents: 4659, refundedCents: 9800, refunds: 2, startedCheckouts: 131, checkoutConversion: 46 / 131,
  productViews: 2210, addsToCart: 288, addToCartRate: 288 / 2210, averageHoursToDeliver: 70.4,
  countries: [{ code: "RO", orders: 21, revenueCents: 98_000 }, { code: "DE", orders: 9, revenueCents: 41_000 }, { code: "FR", orders: 7, revenueCents: 33_000 }, { code: "IT", orders: 5, revenueCents: 24_000 }, { code: "GB", orders: 4, revenueCents: 18_300 }],
  units: 77, revenueCents: 224_100, shippingCents: 23_000, taxCents: 0, unfulfilled: 3, partiallyFulfilled: 1, averageHoursToShip: 19.2, returns: 2, returnRate: 4.3,
  lowStock: [{ title: "Linen shirt", variantName: "M / Sand", available: 2 }], outOfStock: 1, stockValueCents: 120_000,
  topProducts: [{ id: "a", title: "Linen shirt", units: 40, revenueCents: 140_000, orders: 30 }, { id: "b", title: "Ceramic mug set of four in matte glaze", units: 37, revenueCents: 84_100, orders: 16 }],
}

const w = window as unknown as { fetch: typeof fetch }
w.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input)
  const body = url.includes("/api/physical/analytics") ? { analytics: physical } : { reports, truncated: false }
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
}) as typeof fetch

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <div style={{ background: "#fafafa" }} className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PhysicalAnalyticsCard span={{ start, end }} />
      <AnalyticsReports start={new Date(start)} end={new Date(end)} product="all" />
    </div>
  </PlatformSettingsProvider>,
)

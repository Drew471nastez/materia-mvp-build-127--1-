/**
 * Home, the real DashboardClient, mounted with the account in one of a few
 * states, for scripts/check-home-banner.mjs and scripts/check-home-scroll.mjs.
 *
 *   ?state=new        signed up, nothing else
 *   ?state=product    a product, no payouts
 *   ?state=payouts    a product and payouts, no website, no sale
 *   ?state=firstsale  the first sale yesterday, website live, Free
 *   ?state=selling    forty sales in 30 days on Free, website live, no domain
 *   ?state=milestone  Pro, $1,000 in sales passed this week, no domain yet
 *   ?state=quiet      Free, everything done, nothing new
 *   ?state=pro        Pro, everything done, a domain, automations, subscribers
 *
 * The account's facts are handed in as the server would read them
 * (lib/home/progress-server readProgressFacts); `&subs=N` and `&flows=N`
 * set the subscribers and the automations switched on.
 */
import { createRoot } from "react-dom/client"
import { Component, createElement, type ReactNode } from "react"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { NO_FACTS, salesFrom, type ProgressFacts } from "@/lib/home/progress"
import { salesSummary } from "@/lib/home/announcements"
import type { OrderRow } from "@/lib/orders/order-view"
import { buildReports, tallyVisits, type ViewRow } from "@/lib/analytics/reports"

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    ;(window as unknown as { __threw?: string }).__threw = `${error.name}: ${error.message}`
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

const params = new URLSearchParams(location.search)
const state = params.get("state") || "selling"
const DAY = 86_400_000

type Fixture = {
  product: boolean
  payouts: boolean
  site: boolean
  domain: boolean
  plan: string
  /** Days ago, one sale each, at this price. */
  sales: number[]
  price: number
}

const FIXTURES: Record<string, Fixture> = {
  new: { product: false, payouts: false, site: false, domain: false, plan: "free", sales: [], price: 0 },
  product: { product: true, payouts: false, site: false, domain: false, plan: "free", sales: [], price: 0 },
  payouts: { product: true, payouts: true, site: false, domain: false, plan: "free", sales: [], price: 0 },
  firstsale: { product: true, payouts: true, site: true, domain: false, plan: "free", sales: [1], price: 2900 },
  selling: { product: true, payouts: true, site: true, domain: false, plan: "free", sales: Array.from({ length: 40 }, (_, i) => 1 + (i % 29) + i / 40), price: 4500 },
  /* Pro, no domain yet, and $1,000 in sales passed three days ago: 38 older sales of $25, then 4 this week. */
  milestone: { product: true, payouts: true, site: true, domain: false, plan: "growth", sales: [...Array.from({ length: 38 }, (_, i) => 9 + i), 3, 2.5, 2, 1], price: 2500 },
  /* Free with everything done and nothing new: only the plan's own facts are left to say. */
  quiet: { product: true, payouts: true, site: true, domain: true, plan: "free", sales: Array.from({ length: 6 }, (_, i) => 40 + i * 5), price: 1900 },
  pro: { product: true, payouts: true, site: true, domain: true, plan: "growth", sales: Array.from({ length: 30 }, (_, i) => 2 + i * 3), price: 3900 },
}
const f = FIXTURES[state] ?? FIXTURES.selling
const busy = state === "pro" || state === "quiet"
const orders = f.sales.map((days, i) => ({
  id: `order-${i}`,
  product_id: "product-0",
  amount_cents: f.price,
  status: "completed",
  created_at: new Date(Date.now() - days * DAY).toISOString(),
  stripe_session_id: `cs_${i}`,
  refund_amount_cents: 0,
}))

/*
  `&reports=1`: the Analytics answer the chart draws, built from this
  state's orders and a few hundred views with the same code the server
  uses (lib/analytics/reports), after `window.__reportsMs` (the figures
  line) and `window.__listsMs` more (everything). Every request is logged
  in `window.__reportFetches`. For scripts/check-home-chart.mjs; without it
  the reads answer at once with nothing, as before.
*/
if (params.get("reports")) {
  type W = Window & { __reportsMs: number; __listsMs: number; __reportFetches: Array<{ at: number; url: string }> }
  const w = window as unknown as W
  w.__reportsMs = w.__reportsMs ?? 450
  w.__listsMs = w.__listsMs ?? 600
  w.__reportFetches = []
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const views: ViewRow[] = Array.from({ length: 900 }, (_, i) => ({
    session_id: `s${i}`,
    visitor_id: `v${i % 600}`,
    created_at: new Date(Date.now() - 120 * DAY * Math.pow(rnd(), 1.4)).toISOString(),
    source_category: "direct",
    referrer_domain: "Direct",
    country_code: "RO",
    country_name: "Romania",
    city: "Bucharest",
    device_type: "mobile",
    browser: "Safari",
    os: "iOS",
    page_url: "https://storelib.com/andrewrullz",
    utm_campaign: null,
  }))
  const realFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes("/api/analytics/reports")) return realFetch(input, init)
    w.__reportFetches.push({ at: performance.now(), url })
    await new Promise((r) => setTimeout(r, w.__reportsMs))
    const q = new URL(url, location.href).searchParams
    const span = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
    const cs = q.get("cstart")
    const previous = cs ? { start: Date.parse(cs), end: Date.parse(q.get("cend")!) } : null
    const timeZone = q.get("tz") || "UTC"
    const steps = views.filter((_, i) => i % 7 === 0).map((v) => ({ event_type: "buy_click", session_id: v.session_id, created_at: v.created_at }))
    const base = { orders: orders as OrderRow[], window: span, previous, timeZone, mainDomain: "storelib.com", productTitles: { "product-0": "Preset pack" } }
    const allTime = { views: views.length, orders: orders.length, salesCents: orders.reduce((a, o) => a + o.amount_cents, 0) }
    const tallied = tallyVisits({ views, steps, window: span, previous, timeZone })
    const quick = { cur: { ...tallied.cur, steps: undefined, groups: undefined }, prev: { ...tallied.prev, steps: undefined, groups: undefined } }
    const enc = new TextEncoder()
    const body = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode(JSON.stringify({ part: "figures", reports: buildReports({ ...base, visits: quick as never }), allTime, truncated: false }) + "\n"))
        await new Promise((r) => setTimeout(r, w.__listsMs))
        c.enqueue(enc.encode(JSON.stringify({ part: "all", reports: buildReports({ ...base, views, steps }), allTime, truncated: false, viewer: "probe-viewer" }) + "\n"))
        c.close()
      },
    })
    return new Response(body, { headers: { "content-type": "application/x-ndjson" } })
  }) as typeof fetch
}

const facts: ProgressFacts = {
  ...NO_FACTS,
  products: f.product ? 2 : 0,
  publishedProducts: f.product ? 2 : 0,
  paymentsReady: f.payouts,
  websiteLive: f.site,
  domainConnected: f.domain,
  creatorPageDomain: f.domain,
  guideOpened: state !== "new",
  pro: f.plan === "growth",
  subscribers: Number(params.get("subs") ?? (busy ? 180 : 0)),
  automationsOn: Number(params.get("flows") ?? (busy ? 2 : 0)),
  /* The page counts the sales over every order on the server and hands them to Getting started (creatorSalesTotals). */
  ...salesFrom(orders as OrderRow[]),
}


createRoot(document.getElementById("app")!).render(
  createElement(Boundary, null, createElement(LanguageProvider, null, createElement(DashboardClient, {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Andrew",
    initialSetupSteps: [
      { id: "welcome", title: "Welcome", description: "", tooltip: "", completed: true, href: "/app/settings" },
      { id: "branding", title: "Branding", description: "", tooltip: "", completed: f.product, href: "/app/settings" },
      { id: "product", title: "Product", description: "", tooltip: "", completed: f.product, href: "/app/products/new" },
      { id: "payouts", title: "Payouts", description: "", tooltip: "", completed: f.payouts, href: "/app/payouts" },
      { id: "onepage", title: "OnePage", description: "", tooltip: "", completed: f.product, href: "/app/onepage" },
      { id: "sale", title: "Sale", description: "", tooltip: "", completed: f.sales.length > 0, href: "/app/orders" },
    ],
    productIds: f.product ? ["product-0", "product-1"] : [],
    /* Home reads no orders in the browser now: the page hands the banner its sales, counted on the server. */
    bannerSales: salesSummary(orders as OrderRow[], Date.now()),
    initialProgress: facts,
    creatorHandle: "andrewrullz",
    connectedDomain: f.domain ? "andrewrullz.com" : null,
    websiteDomain: f.domain ? "andrewrullz.com" : null,
    websitePublished: f.site,
    subscriptionPlanId: params.get("plan") || f.plan,
    viewerId: "probe-viewer",
    sharePlatforms: [],
    onePageLive: f.product,
  } as never))),
)
;(window as unknown as { __ran?: boolean }).__ran = true

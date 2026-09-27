/**
 * The real client side of each main /app page, landing the way a navigation
 * lands it, with fixture data that arrives a little after the commit the way
 * a phone's network delivers it. For scripts/check-page-flash.mjs, which
 * records every frame from the commit on and looks for anything that changes
 * twice: a flash.
 *
 * `?page=` picks the page. The shell is app/app/layout.tsx's frame (the
 * header, the rounded content area, its scroller), and the landing is the
 * stage's own (components/app/app-stage.tsx playEntrance), started in the
 * commit, as a navigation starts it.
 *
 * Everything the pages read after they land is stubbed to answer after
 * `window.__dataDelay` ms (160 by default): Supabase (a stub aliased in for
 * @/lib/supabase/client, which answers `window.__tables`), and fetch.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { LanguageProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import { playEntrance } from "@/components/app/app-stage"
import { DashboardClient } from "@/components/app/dashboard-client"
import { AnalyticsClient } from "@/app/app/analytics/analytics-client"
import { EmailsHome, type EmailsTab } from "@/app/app/emails/emails-home"
import { ProductsClient } from "@/app/app/products/products-client"
import { PayoutsClient } from "@/app/app/payouts/payouts-client"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/app/website-builder/website-builder-client"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { OrdersClient } from "@/app/app/orders/orders-client"
import CustomersPage from "@/app/app/customers/page"
import { buildReports, type ViewRow } from "@/lib/analytics/reports"
import { resolveValue, todayIn } from "@/lib/date-range/range"
import type { OrderRow } from "@/lib/orders/order-view"
import { legacyFacts, salesFrom } from "@/lib/home/progress"

type W = Window & {
  __dataDelay: number
  __tables: Record<string, unknown[]>
  __committedAt?: number
  __threw?: string
  __ran?: boolean
}
const w = window as unknown as W
w.__dataDelay = Number(new URLSearchParams(location.search).get("delay") ?? 160)
const page = new URLSearchParams(location.search).get("page") || "home"
const DAY = 86_400_000
const now = Date.now()

/* ── Fixtures ─────────────────────────────────────────────────────────── */

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const views: ViewRow[] = Array.from({ length: 600 }, (_, i) => ({
  session_id: `s${i}`,
  visitor_id: `v${i % 400}`,
  created_at: new Date(now - 60 * DAY * rnd()).toISOString(),
  source_category: ["direct", "social_instagram", "organic_search"][i % 3],
  referrer_domain: "Direct",
  country_code: ["RO", "US", "GB"][i % 3],
  country_name: ["Romania", "United States", "United Kingdom"][i % 3],
  city: ["Bucharest", "New York", "London"][i % 3],
  device_type: i % 2 ? "mobile" : "desktop",
  browser: "Safari",
  os: "iOS",
  page_url: "https://storelib.com/ana",
  utm_campaign: null,
}))
const PRODUCTS = [{ id: "p1", title: "Lightroom preset pack" }, { id: "p2", title: "Brush set" }, { id: "p3", title: "Portrait course" }]
const orders: OrderRow[] = Array.from({ length: 60 }, (_, i) => ({
  id: `o${i}`,
  product_id: PRODUCTS[i % 3].id,
  amount_cents: [1200, 2900, 4900][i % 3],
  status: "completed",
  created_at: new Date(now - 60 * DAY * rnd()).toISOString(),
  source: "storelib",
  buyer_country_code: "RO",
  buyer_country: "Romania",
} as OrderRow))

w.__tables = {
  analytics_events: views.map((v, i) => ({ id: `e${i}`, visitor_id: v.visitor_id, session_id: v.session_id, product_id: null, created_at: v.created_at })),
}

/* Every fetch answers after the delay: the analytics page's reports, and an
   empty success for anything else. */
const realFetch = window.fetch.bind(window)
w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.startsWith("data:")) return realFetch(input, init)
  await new Promise((r) => setTimeout(r, w.__dataDelay))
  if (url.includes("/api/analytics")) {
    const q = new URL(url, location.href).searchParams
    const window_ = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
    const cs = q.get("cstart")
    const previous = cs ? { start: Date.parse(cs), end: Date.parse(q.get("cend")!) } : null
    const reports = buildReports({
      views, steps: [], orders, window: window_, previous, timeZone: q.get("tz") || "UTC", mainDomain: "storelib.com",
      productTitles: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.title])),
    })
    return new Response(JSON.stringify({ reports, allTime: { views: views.length, orders: orders.length, salesCents: 99_000 }, truncated: false }), { headers: { "content-type": "application/json" } })
  }
  return new Response("{}", { headers: { "content-type": "application/json" } })
}) as typeof fetch

/* ── The pages ────────────────────────────────────────────────────────── */

function Emails() {
  /* The emails page reads its lists after it lands (app/app/emails/page.tsx
     loadData): `loading` until they come. */
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<EmailsTab>("published")
  React.useEffect(() => { const t = setTimeout(() => setLoading(false), w.__dataDelay); return () => clearTimeout(t) }, [])
  const today = todayIn("UTC", now)
  const [period, setPeriod] = React.useState(() => resolveValue({ preset: "last_30_days" }, today, "last_30_days"))
  const campaigns = loading ? [] : Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, subject: `Update number ${i}`, sent_at: new Date(now - i * 3 * DAY).toISOString(), scheduled_at: null,
    created_at: new Date(now - i * 3 * DAY).toISOString(), recipient_count: 300 + i, unique_opens: 150 - i, unique_clicks: 30,
  }))
  const noop = () => {}
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
      <EmailsHome
        tab={tab} onTab={setTab} loading={loading}
        subscribers={[]} checkoutBuyersCount={0} search="" onSearch={noop} onExportSubscribers={noop} onCopyEmail={noop} onRemoveSubscriber={noop}
        flows={[]} onToggleFlow={noop} onDeleteFlow={noop} onDuplicateFlow={noop}
        campaigns={campaigns as never} onOpenCampaign={noop} onCampaignIntent={noop} onDuplicateCampaign={noop} onDeleteCampaign={noop}
        overview={loading ? null : { total_sent: 3600, total_opened: 1900, total_clicked: 410, total_unsubscribed: 7, open_rate: 52.8, click_rate: 11.4 }}
        usage={{ sent: 2100, limit: 3000 }} period={period} onPeriod={setPeriod} today={today}
      />
    </div>
  )
}

function Customers() {
  const [el, setEl] = React.useState<React.ReactNode>(null)
  React.useEffect(() => { void (CustomersPage as () => Promise<React.ReactNode>)().then(setEl) }, [])
  return <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">{el}</div>
}

const ago = (m: number) => new Date(now - m * 60_000).toISOString()
const installs: WebsiteSummary[] = ["Storelib Default", "Studio", "Atelier"].map((name, i) => ({
  id: `site-${i}`, name, status: i === 0 ? "published" : "draft", theme_id: "storelib-default",
  created_at: ago(60 * 48), updated_at: ago(60 * (i + 1)), published_at: i === 0 ? ago(60) : null,
  snapshot_url: null, snapshot_mobile_url: null, snapshot_updated_at: null, saved_at: ago(60 * (i + 1)),
  theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" }, settings: null,
})) as WebsiteSummary[]

function Page() {
  switch (page) {
    case "home":
      return (
        <DashboardClient {...({
          creatorId: "c1", displayName: "Ana", productIds: ["p1", "p2", "p3"],
          /* What app/app/page.tsx hands Home since b920281e: the account's
             facts with the sales already counted on the server, so the steps
             are right on the first frame (the old checklist prop left the
             sales at 0 until Home's answer, and "2 of 8" became "3 of 8"). */
          initialProgress: {
            ...legacyFacts([{ id: "product", completed: true }, { id: "payouts", completed: false }], "free"),
            ...salesFrom(orders as never),
          },
          initialOrders: orders.map((o) => ({ ...o, total_cents: o.amount_cents, product_title: "Preset pack", buyer_email: "a@example.com" })),
          initialTotalOrders: orders.length, initialTotalRevenue: 99_000, creatorHandle: "ana", connectedDomain: null,
          brandingDetail: null, websitePublished: true, subscriptionPlanId: "free",
        } as unknown as React.ComponentProps<typeof DashboardClient>)} />
      )
    case "orders":
      return (
        <OrdersClient
          rows={orders.map((o, i) => ({ ...o, buyer_email: `buyer${i}@example.com`, buyer_name: `Buyer ${i}`, product_title: PRODUCTS[i % 3].title })) as never}
          products={PRODUCTS} stripeConnected hiddenColumns={[]} initialRange={null} timeZone="UTC" now={now}
        />
      )
    case "products":
      return (
        <ProductsClient creatorUsername="ana" products={Array.from({ length: 10 }, (_, i) => ({
          id: `p${i}`, creator_id: "c1", title: `Product ${i + 1}`, type: "digital", price_cents: 1200 + i * 300,
          status: i % 4 === 3 ? "draft" : "published", thumbnail_url: null, slug: `product-${i}`,
          created_at: new Date(now - i * DAY).toISOString(), archived: false, sales_count: i * 3,
        })) as never} />
      )
    case "analytics":
      return <div style={{ height: "100%" }}><AnalyticsClient creatorId="c1" userId="u1" products={PRODUCTS} properties={{ onePageId: null, websites: [], defaultWebsite: null }} /></div>
    case "emails":
      return <Emails />
    case "customers":
      return <Customers />
    case "payouts":
      return (
        <div className="h-full overflow-y-auto page-scroll bg-[#fafafa]">
          <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <PayoutsClient
              creator={{ id: "c1", stripe_account_id: "acct_1", default_currency: "usd" } as never}
              initialData={{ totalEarnings: 99_000, totalFees: 3_000, netEarnings: 96_000, pendingAmount: 12_000, availableBalance: 40_000, paidOut: 44_000, exchangeRate: 1, negativeBalance: 0, activeDisputeCount: 0, totalDisputedAmount: 0, taxData: null } as never}
              initialOrders={[]}
            />
          </div>
        </div>
      )
    case "website":
      return <TooltipProvider><WebsiteBuilderClient installs={installs} username="ana" /></TooltipProvider>
    case "settings":
      return (
        <SettingsFormNew
          profile={{ id: "u1", email: "ana@example.com", full_name: "Ana", display_name: "Ana", first_name: "Ana", last_name: "", username: "ana", avatar_url: null, bio: "", country: "RO", created_at: ago(9999), updated_at: ago(9999) } as never}
          creator={{ id: "c1", user_id: "u1", slug: "ana", username: "ana", display_name: "Ana", stripe_account_id: null, store_published: true } as never}
          websitePublished initialTab="general"
        />
      )
    default:
      return null
  }
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { w.__threw = `${error.name}: ${error.message}` }
  render() { return this.state.failed ? null : this.props.children }
}

/* The landing, in the commit, as the stage plays it on a navigation. */
function Landing({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    w.__committedAt = performance.now()
    if (ref.current) playEntrance(ref.current)
  }, [])
  return <div ref={ref} className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
}

function Shell() {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <Landing>
          <div data-flash-page={page} className="h-full">
            <Boundary><Page /></Boundary>
          </div>
        </Landing>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
w.__ran = true

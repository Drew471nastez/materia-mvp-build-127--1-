/**
 * The shell pieces that move when an /app page swaps (AppStage's landing and
 * scroll, the top bar, the slow page surface) over a shell with the same
 * boxes and classes as app/(storelib)/app/layout.tsx, with the REAL client side of the
 * main pages in it. Bundled by scripts/check-scrollbar-stable.mjs.
 *
 *   /app                  the dashboard (components/app/dashboard-client)
 *   /app/products         Products with three products: nothing to scroll
 *   /app/orders           Orders with a hundred and thirty: a long list, and
 *                         an order over it (?order=)
 *   /app/emails           Emails, its tabs, and an email over the list
 *   /app/coupons          Coupons
 *   /app/analytics        Analytics
 *   /app/payouts          Payouts, in its page's own box
 *   /app/settings         Settings (?tab=billing for the billing tab)
 *   /app/website-builder  the list of websites
 *   /app/customers        Customers
 *   /app/products/x       the product editor, in its layout: on a computer a
 *                         page in the shell, scrolling in its own pane, with
 *                         Save and Cancel at the foot from 1024px
 *
 * and two stand-ins, for the shapes no real page has on its own:
 *
 *   /app/sites            short, in the shell's scroller
 *   /app/fits             as tall as the scroller less 1px: the one the 2px
 *                         rise of the landing pushes over the edge
 *
 * `?v=short` or `?v=long` on the first load picks the short or the long
 * version of every page that has both (the audit loads each both ways).
 * Products is short and Orders is long otherwise: the pair from the report.
 *
 * Everything the pages read after they land answers from fixtures: Supabase
 * (a stand-in aliased for @/lib/supabase/client) and fetch.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname, useSearchParams } from "next/navigation"

import { LanguageProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import EditProductLayout from "@/app/(storelib)/app/products/[id]/layout"
import { ProductEditor } from "@/app/(storelib)/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/(storelib)/app/products/new/editor-form"
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { DashboardClient } from "@/components/app/dashboard-client"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { OrdersClient } from "./fixtures/orders-client"
import { EmailsClient } from "@/app/(storelib)/app/emails/emails-client"
import { CouponsClient } from "@/app/(storelib)/app/coupons/coupons-client"
import { AnalyticsClient } from "@/app/(storelib)/app/analytics/analytics-client"
import { PayoutsClient } from "@/app/(storelib)/app/payouts/payouts-client"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"
import CustomersPage from "@/app/(storelib)/app/customers/page"
import { buildReports, type ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

type W = Window & {
  __delay: number
  __navigate: (href: string) => void
  __commit: (href: string) => void
  __commitNow: (href: string) => void
  __tables: Record<string, unknown[] | Record<string, unknown>>
  __commitHistory: typeof history.pushState
}
const w = window as unknown as W
w.__delay = 80
watchRouterStarts()

const variant = new URLSearchParams(location.search).get("v")
const long = (path: string) => (variant ? variant === "long" : path !== "/app/products")

let latest = 0
w.__navigate = (href: string) => {
  noteRouterStart()
  const mine = ++latest
  window.setTimeout(() => {
    if (mine !== latest) return
    w.__commitHistory({ __NA: true }, "", href)
    w.__commit(href)
  }, w.__delay)
}
window.addEventListener("popstate", () => {
  const href = window.location.pathname + window.location.search
  window.setTimeout(() => w.__commit(href), w.__delay)
})

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const DAY = 86_400_000
const now = Date.parse("2026-09-24T15:00:00Z")
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const PRODUCTS = [
  { id: "p1", title: "Lightroom preset pack", type: "digital" },
  { id: "p2", title: "Brush set for Procreate", type: "digital" },
  { id: "p3", title: "Portrait course", type: "course" },
]
const NAMES = [["Ana", "Pop"], ["Mihai", "Ionescu"], ["Elena", "Radu"], ["Jordan", "Blake"], ["Sam", "Rivera"]]

function orderRows(n: number): OrderRow[] {
  return Array.from({ length: n }, (_, i) => {
    const [first, last] = NAMES[i % NAMES.length]
    const product = PRODUCTS[i % PRODUCTS.length]
    const at = new Date(now - 3 * 60_000 - i * 7.3 * 3_600_000).toISOString()
    return {
      id: `ord-${String(i).padStart(4, "0")}`,
      product_id: product.id,
      amount_cents: [1200, 2900, 4900][i % 3],
      fee_cents: 90,
      status: "completed",
      created_at: at,
      buyer_email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      buyer_first_name: first,
      buyer_last_name: last,
      buyer_country: "Romania",
      buyer_country_code: "RO",
      buyer_device_type: "Desktop",
      buyer_os: "macOS",
      buyer_browser: "Safari",
      card_brand: "visa",
      card_last4: "4242",
      payment_method: "card",
      receipt_token: `tok-${i}`,
      stripe_payment_intent_id: `pi_${i}`,
      stripe_session_id: null,
      refund_amount_cents: null,
      refunded_at: null,
      buyer_notified_at: new Date(Date.parse(at) + 40_000).toISOString(),
      buyer_email_last_error: null,
      source: "storelib",
      source_detail: { surface: "product", from: "direct" },
      product: { id: product.id, title: product.title, type: product.type, thumbnail_url: null },
    } as unknown as OrderRow
  })
}

const views: ViewRow[] = Array.from({ length: 300 }, (_, i) => ({
  session_id: `s${i}`, visitor_id: `v${i % 200}`, created_at: new Date(now - 30 * DAY * rnd()).toISOString(),
  source_category: ["direct", "social_instagram", "organic_search"][i % 3], referrer_domain: "Direct",
  country_code: "RO", country_name: "Romania", city: "Bucharest", device_type: i % 2 ? "mobile" : "desktop",
  browser: "Safari", os: "iOS", page_url: "https://storelib.com/ana", utm_campaign: null,
}))

const subscribers = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `s${i}`, email: `person${i}@example.com`, name: `Person ${i}`, source: "onepage", status: "subscribed",
  subscribed_at: new Date(now - i * DAY).toISOString(), unsubscribed_at: null,
}))
const campaigns = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, subject: `Studio notes, issue ${30 - i}`, status: "sent",
  sent_at: new Date(now - i * 3 * DAY).toISOString(), created_at: new Date(now - i * 3 * DAY).toISOString(),
  recipient_count: 1200 + i, unique_opens: 610 - i * 7, unique_clicks: 140 - i,
}))

w.__tables = {
  creators: [{ id: "c1" }],
  subscribers: subscribers(long("/app/emails") ? 60 : 2),
  products: [{ id: "p1" }],
  orders: [],
  email_flows: [],
  analytics_events: [],
}

const realFetch = window.fetch.bind(window)
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("data:")) return realFetch(input, init)
  await new Promise((r) => setTimeout(r, 60))
  const path = url.replace(location.origin, "")
  if (path.startsWith("/api/analytics")) {
    const q = new URL(url, location.href).searchParams
    const span = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
    const reports = buildReports({ views, steps: [], orders: [], window: span, previous: null, timeZone: "UTC", mainDomain: "storelib.com", productTitles: {} })
    return json({ reports, allTime: { views: views.length, orders: 0, salesCents: 0 }, truncated: false })
  }
  if (path.startsWith("/api/email/stats")) {
    return json({ campaigns: campaigns(long("/app/emails") ? 14 : 1), stats: { totalSent: 16840, totalOpens: 8420, totalClicks: 1930, totalUnsubscribed: 31, openRate: 50, clickRate: 11 }, monthlyUsage: { sent: 1402, limit: 2000 } })
  }
  if (path.startsWith("/api/email/campaigns?status=")) return json({ campaigns: [] })
  if (path.startsWith("/api/billing/overview")) {
    const free = { id: "free", name: "Free", price_cents: 0, fee_percent: 0.05, fee_fixed_cents: 30 }
    return json({ plans: [free, { ...free, id: "growth", name: "Growth", price_cents: 1900, fee_percent: 0.02 }], subscription: null, currentPlan: free, invoices: [], paymentMethod: null })
  }
  const report = /^\/api\/email\/campaigns\/([^/]+)\/report$/.exec(path)
  if (report) {
    return json({
      campaign: { id: report[1], subject: "Studio notes", preview_text: "", status: "sent", audience_type: "all", segment_id: null, audience_count: 1204, scheduled_at: null, sent_at: new Date(now - DAY).toISOString(), completed_at: new Date(now - DAY).toISOString(), created_at: new Date(now - 2 * DAY).toISOString(), updated_at: new Date(now - DAY).toISOString(), track_opens: true, last_error: null },
      counts: { total: 1204, pending: 0, sending: 0, sent: 402, delivered: 790, bounced: 9, failed: 2, skipped: 1, unknown: 0 },
      stats: { sent: 1201, delivered: 790, bounced: 8, complained: 1, opened: 604, clicked: 139, unsubscribed: 6, failed: 2, unknown: 0, skipped: 1, waiting: 0 },
      links: [], html: "<p>Hi there</p>".repeat(40),
      sender: { name: "Ana", from: "Ana <noreply@storelib.com>", replyTo: null, address: "" }, upgraded: true,
    })
  }
  return json({})
}) as typeof fetch

/* ── The pages ────────────────────────────────────────────────────────── */

const COLUMN = "mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8"
const CARD = "mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

function Cards({ n }: { n: number }) {
  return (
    <>
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Page</h1>
      {Array.from({ length: n }, (_, i) => <div key={i} className={CARD} />)}
    </>
  )
}

const ago = (m: number) => new Date(now - m * 60_000).toISOString()
const installs = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `site-${i}`, name: `Site ${i + 1}`, status: i === 0 ? "published" : "draft", theme_id: "storelib-default",
  created_at: ago(60 * 48), updated_at: ago(60 * (i + 1)), published_at: i === 0 ? ago(60) : null,
  snapshot_url: null, snapshot_mobile_url: null, snapshot_updated_at: null, saved_at: ago(60 * (i + 1)),
  theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" }, settings: null,
})) as unknown as WebsiteSummary[]

/* The product being edited: a long one, or a short one with nothing to scroll. */
function editing(long: boolean): LoadedProduct {
  return {
    product: {
      id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6", creator_id: "c1", title: "Portrait presets",
      description: long ? "<p>Forty presets made on real client sessions.</p>".repeat(30) : "<p>Forty presets.</p>",
      price_cents: 2900, compare_at_cents: null, slug: "portrait-presets", type: "digital", status: "published",
      show_sales_badge: true, refund_policy_enabled: false, refund_policy_type: null, seo_title: null, seo_description: null,
      call_to_action: "Buy Now", category: "Photography", pay_what_you_want: false, thumbnail_url: null, gallery_urls: [],
      whats_included: long ? ["40 presets", "Before and after files", "Lifetime updates"] : [],
      faqs: long ? Array.from({ length: 6 }, (_, i) => ({ question: `Question ${i + 1}`, answer: "An answer." })) : [],
    },
    assets: [],
    variants: [],
  } as unknown as LoadedProduct
}

function Customers() {
  const [el, setEl] = React.useState<React.ReactNode>(null)
  React.useEffect(() => { void (CustomersPage as () => Promise<React.ReactNode>)().then(setEl) }, [])
  return <div className={COLUMN}>{el}</div>
}

function Page({ path, search }: { path: string; search: string }) {
  const L = long(path)
  switch (path) {
    case "/app/sites":
      return <div data-page="sites"><div className={COLUMN}><Cards n={2} /></div></div>
    case "/app/fits":
      /* As tall as the scroller, less 1px: it fits, until the 2px rise moves it down. */
      return (
        <div data-page="fits" className="h-[calc(100svh-58px-1px)] overflow-hidden bg-[#fafafa]">
          <div className={COLUMN}><Cards n={1} /></div>
        </div>
      )
    case "/app/products/x":
      return (
        <EditProductLayout>
          <ProductEditor creator={{ id: "c1", slug: "ana", username: "ana" }} loaded={editing(L)} />
        </EditProductLayout>
      )
    case "/app":
      return (
        <DashboardClient {...({
          creatorId: "c1", displayName: "Ana", productIds: ["p1", "p2", "p3"],
          initialSetupSteps: [
            { id: "welcome", title: "Welcome", description: "Account created", tooltip: "", completed: true, href: "/app/settings" },
            { id: "product", title: "Product", description: "Add your first product", tooltip: "", completed: true, href: "/app/products" },
          ],
          initialOrders: [], initialTotalOrders: 0, initialTotalRevenue: 0, creatorHandle: "ana", connectedDomain: null,
          brandingDetail: null, websitePublished: true, subscriptionPlanId: "free",
        } as unknown as React.ComponentProps<typeof DashboardClient>)} />
      )
    case "/app/products":
      return (
        <ProductsClient creatorUsername="ana" products={Array.from({ length: L ? 40 : 3 }, (_, i) => ({
          id: `p${i}`, creator_id: "c1", title: `Product ${i + 1}`, type: "digital", price_cents: 1200 + i * 300,
          status: "published", thumbnail_url: null, slug: `product-${i}`,
          created_at: new Date(now - i * DAY).toISOString(), archived: false, sales_count: i,
        })) as never} />
      )
    case "/app/orders":
      return (
        <OrdersClient
          rows={orderRows(L ? 130 : 2)} products={PRODUCTS} stripeConnected hiddenColumns={[]} initialRange={null} timeZone="UTC" now={now}
        />
      )
    case "/app/emails":
      return <EmailsClient initialTab={(new URLSearchParams(search).get("tab") as never) || "subscribers"} />
    case "/app/coupons":
      return (
        <CouponsClient creatorId="c1" products={[]} initialCoupons={Array.from({ length: L ? 30 : 1 }, (_, i) => ({
          id: `k${i}`, creator_id: "c1", code: `SAVE${i}`, discount_type: "percentage", discount_value: 10, product_ids: null,
          usage_limit: null, usage_count: i, starts_at: null, expires_at: null, is_active: true, created_at: ago(i * 60),
        }))} />
      )
    case "/app/analytics":
      return <AnalyticsClient creatorId="c1" userId="u1" products={PRODUCTS.map(({ id, title }) => ({ id, title })) as never} properties={{ onePageId: null, websites: [], defaultWebsite: null }} />
    case "/app/payouts":
      /* app/(storelib)/app/payouts/page.tsx's own box, around the client. */
      return (
        <div className="h-full overflow-y-auto page-scroll bg-[#fafafa] app-page-enter">
          <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
            <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">Payouts</h1>
            <PayoutsClient
              paymentsReady
              creator={{ id: "c1", stripe_account_id: "acct_1", default_currency: "usd" } as never}
              initialData={{ balanceCurrency: "usd", salesCurrency: "usd", pendingAmount: 12_000, availableBalance: 40_000, stripeRead: true, negativeBalance: 0, activeDisputeCount: 0, totalDisputedAmount: 0, taxData: null }}
              initialOrders={[]}
            />
          </div>
        </div>
      )
    case "/app/settings":
      return (
        <SettingsFormNew
          profile={{ id: "u1", email: "ana@example.com", full_name: "Ana", display_name: "Ana", first_name: "Ana", last_name: "", username: "ana", avatar_url: null, bio: "", country: "RO", created_at: ago(9999), updated_at: ago(9999) } as never}
          creator={{ id: "c1", user_id: "u1", slug: "ana", username: "ana", display_name: "Ana", stripe_account_id: null, store_published: true } as never}
          websitePublished initialTab={(new URLSearchParams(search).get("tab") as never) || "general"}
        />
      )
    case "/app/website-builder":
      return <WebsiteBuilderClient installs={installs(L ? 9 : 1)} username="ana" />
    case "/app/customers":
      return <Customers />
    default:
      return <div data-page="other" />
  }
}

class Boundary extends React.Component<{ children: React.ReactNode; path: string }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(error: Error) { return { failed: `${error.name}: ${error.message}` } }
  componentDidCatch(error: Error) { (window as unknown as { __threw?: string[] }).__threw = [...((window as unknown as { __threw?: string[] }).__threw ?? []), `${this.props.path}: ${error.message} ${(error.stack || "").split("\n").slice(1, 3).join(" ")}`] }
  render() { return this.state.failed ? <div data-page="threw">{this.state.failed}</div> : this.props.children }
}

const LINKS = ["/app", "/app/sites", "/app/settings", "/app/fits", "/app/products", "/app/coupons", "/app/orders", "/app/emails", "/app/analytics", "/app/payouts", "/app/website-builder", "/app/customers", "/app/products/x"]

function Shell() {
  const path = usePathname()
  const search = useSearchParams().toString()
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
      <header data-shell-chrome="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px] md:bg-[#131316]">
        <nav className="flex h-full items-center gap-3 overflow-hidden px-3 text-[11px] text-white/90">
          {LINKS.map((href) => (
            <a key={href} href={href} data-to={href} onClick={(e) => { e.preventDefault(); w.__navigate(href) }}>
              {href.replace("/app", "") || "/"}
            </a>
          ))}
        </nav>
      </header>
      <aside data-shell-chrome="" className="fixed left-0 top-[58px] z-40 hidden h-[calc(100svh-58px)] w-[240px] bg-white md:block" />
      <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll" data-shown={search ? `${path}?${search}` : path}>
          <Boundary key={path} path={path}><Page path={path} search={search} /></Boundary>
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <TooltipProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
        <AppStage />
      </Suspense>
      <Shell />
    </TooltipProvider>
  </LanguageProvider>,
)

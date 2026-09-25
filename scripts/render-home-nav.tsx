/**
 * ===========================================================================
 *  HOME INSIDE THE /app SHELL, WITH A ROUTER THAT KNOWS WHAT WAS FETCHED
 * ===========================================================================
 * For scripts/check-home-nav.mjs: the real Home (DashboardClient), the real
 * stage and bar (components/app/app-stage, navigation-loading-bar), the
 * real rows of the desktop rail (DesktopNavItem) wired exactly as
 * components/app/sidebar.tsx wires them, and the real phone pill
 * (MobileNavPill), wired the same way.
 *
 * The router is only what those components can see of one (the address, a
 * push, a prefetch), with a "server" behind it: a page asked for with a full
 * prefetch (prefetchAppPage) is ready PREFETCH_MS later and a push to it
 * commits on the next frame; a page that was not takes window.__delay, as a
 * page with no loading boundary does when nothing fetched it ahead. A click
 * on a link is seen the way the real router counts it (noteRouterStart). A
 * whole document load, which is what an <a> without the router is, is
 * recorded by the window marker disappearing.
 */
import React, { Suspense, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { NavigationLoadingBar, startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { DashboardClient } from "@/components/app/dashboard-client"
import { LanguageProvider } from "@/lib/i18n/context"
import { DesktopNavItem, NAV_ICONS, NAV_ICONS_EXTRA, type NavItemData } from "@/components/app/sidebar-desktop-nav"
import { MobileNavPill } from "@/components/app/sidebar-mobile-nav"
import { NO_FACTS } from "@/lib/home/progress"

type Router = {
  push: (href: string) => void
  replace: (href: string) => void
  prefetch: (href: string, options?: unknown) => void
  refresh: () => void
  back: () => void
}
type W = Window & {
  __delay: number
  __router: Router
  __address: { path: string; search: string }
  __listeners: Set<() => void>
  __log: { t: number; what: string; href?: string }[]
  __marker: string
}
const w = window as unknown as W
const PREFETCH_MS = 120
w.__delay = 450
w.__marker = "same-document"
w.__log = []
w.__listeners = new Set()
w.__address = { path: location.pathname, search: location.search.replace(/^\?/, "") }
watchRouterStarts()

const log = (what: string, href?: string) => w.__log.push({ t: performance.now(), what, href })
const pathOf = (href: string) => href.split(/[?#]/)[0]
/* When a fully prefetched page is ready: its path, and the moment. */
const ready = new Map<string, number>()
let latest = 0

function commit(href: string) {
  const url = new URL(href, location.href)
  window.history.pushState({ __NA: true }, "", url.pathname + url.search)
  w.__address = { path: url.pathname, search: url.search.replace(/^\?/, "") }
  log("commit", url.pathname + url.search)
  for (const f of [...w.__listeners]) f()
}

w.__router = {
  push(href) {
    noteRouterStart()
    log("push", href)
    const mine = ++latest
    const at = ready.get(pathOf(href))
    const wait = at == null ? w.__delay : Math.max(0, at - performance.now())
    /* The router commits a page it holds in the same task as the push; a frame at most. */
    window.setTimeout(() => {
      if (mine === latest) commit(href)
    }, Math.max(16, wait))
  },
  replace(href) {
    this.push(href)
  },
  prefetch(href, options) {
    const full = !!options && typeof options === "object" && (options as { kind?: string }).kind === "full"
    log(full ? "prefetch-full" : "prefetch", href)
    if (!full) return
    const p = pathOf(href)
    if (!ready.has(p)) ready.set(p, performance.now() + PREFETCH_MS)
  },
  refresh() {},
  back() {
    history.back()
  },
}
/* For the probe's contrast: a page nothing fetched ahead, as every link on Home was before. */
;(w as unknown as { __forget: (path: string) => void }).__forget = (path) => {
  ready.delete(path)
}
window.addEventListener("popstate", () => {
  w.__address = { path: location.pathname, search: location.search.replace(/^\?/, "") }
  for (const f of [...w.__listeners]) f()
})

function useAddress() {
  return useSyncExternalStore(
    (f) => {
      w.__listeners.add(f)
      return () => w.__listeners.delete(f)
    },
    () => w.__address,
  )
}

const orders = Array.from({ length: 6 }, (_, i) => ({
  id: `order-${i}`,
  product_id: "product-0",
  amount_cents: 2900,
  status: "paid",
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
  stripe_session_id: `cs_${i}`,
  refund_amount_cents: 0,
}))

const HOME_PROPS = {
  creatorId: "00000000-0000-4000-8000-000000000000",
  displayName: "Andrew",
  /* The guide opened, so the next step is a page (Set up payments), fetched once the card is seen. */
  initialProgress: { ...NO_FACTS, products: 1, publishedProducts: 1, guideOpened: true },
  productIds: ["product-0"],
  initialOrders: orders,
  creatorHandle: "andrewrullz",
  connectedDomain: null,
  websitePublished: false,
  subscriptionPlanId: "free",
} as unknown as React.ComponentProps<typeof DashboardClient>

function Home() {
  return <DashboardClient {...HOME_PROPS} />
}

/** Any other page: a heading and cards, in the shell's own scroller, as most /app pages are. */
function Page({ id }: { id: string }) {
  return (
    <div data-page={id} className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{id}</h1>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
      ))}
    </div>
  )
}

const RAIL: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Sales", icon: NAV_ICONS.orders },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
]

function Shell() {
  const { path } = useAddress()
  const id = path === "/app" ? "home" : path.replace(/^\/app\//, "").replace(/\//g, "-") || "home"
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
      <aside data-rail="" className="fixed left-0 top-[58px] z-40 hidden h-[calc(100svh-58px)] w-[240px] flex-col border-r border-neutral-200/60 bg-white px-[7px] pt-3 md:flex">
        {RAIL.map((item) => (
          <DesktopNavItem
            key={item.href}
            item={item}
            expanded={false}
            onToggle={() => {}}
            onNavigate={(href) => startNavigationLoading(href)}
            onForceNavigate={(href) => {
              startNavigationLoading(href)
              window.location.href = href
            }}
            onPrefetch={(href) => prefetchAppPage(w.__router as never, href)}
          />
        ))}
      </aside>
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          {id === "home" ? <Home key="home" /> : <Page key={id} id={id} />}
        </div>
      </main>
      <MobileNavPill
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        onNavigate={(href) => {
          startNavigationLoading(href)
          w.__router.push(href)
        }}
        onPrefetch={(href) => prefetchAppPage(w.__router as never, href)}
        icons={{ home: NAV_ICONS.dashboard, orders: NAV_ICONS.orders, products: NAV_ICONS.products, analytics: NAV_ICONS.analytics, settings: NAV_ICONS_EXTRA.settings }}
      />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Suspense fallback={null}>
      <NavigationLoadingBar />
      <AppStage />
    </Suspense>
    <Shell />
  </LanguageProvider>,
)
;(window as unknown as { __ran?: boolean }).__ran = true

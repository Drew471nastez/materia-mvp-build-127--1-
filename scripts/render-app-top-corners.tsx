/**
 * The /app shell as app/app/layout.tsx mounts it, for
 * scripts/check-app-top-corners.mjs: the real AppSidebar (both black
 * headers, the rail, the pill), the real AppStage (a page's landing and a
 * slow page's surface) and one of these pages in the real <main>:
 *
 *   /app            the real Home (components/app/dashboard-client.tsx), its
 *                   rotating strip at the top, from fixture props
 *   /app/analytics  the real Try Pro strip (TryProStrip) over a page that
 *                   scrolls in its own box, as Analytics and Emails do
 *   /app/payouts    the Try Pro strip and then a sticky white page bar, in an
 *                   orders pane, as Payouts has them
 *   /app/orders     a sticky white page bar and nothing above it
 *   /app/products   a plain grey page scrolling in its own box
 *   /app/settings   content in the shell's own scroller
 *
 * `window.__go(path)` commits a navigation the way the router does (the
 * address changes with the new page, in the same render), so AppStage plays
 * the page's landing. `window.__startNav(path)` starts one that never
 * commits (beginAppNavigation, as a press does), so a slow page's surface
 * comes up. `?cold=1` draws the native
 * cold start (app/app/cold-start.tsx) instead of the shell.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { AppSidebar } from "@/components/app/sidebar"
import { AppStage } from "@/components/app/app-stage"
import { beginAppNavigation } from "@/lib/ui/app-navigation"
import { DashboardClient } from "@/components/app/dashboard-client"
import { TryProStrip } from "@/components/app/announcement-bar-mobile"
import AppColdStart from "@/app/app/cold-start"

type W = Window & { __go: (href: string) => void; __startNav: (href: string) => void; __commit: (href: string) => void; __ran?: boolean }
const w = window as unknown as W
w.__startNav = (href) => beginAppNavigation(href)
w.__go = (href) => {
  window.history.pushState({ __NA: true }, "", href)
  w.__commit(href)
}

window.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch
window.open = (() => null) as typeof window.open

const DAY = 86_400_000
const orders = Array.from({ length: 60 }, (_, i) => ({
  id: `o${i}`,
  product_id: `p${i % 6}`,
  amount_cents: 900 + ((i * 731) % 5000),
  status: "completed",
  created_at: new Date(Date.now() - (i % 30) * DAY - i * 3_600_000).toISOString(),
  stripe_session_id: `cs_${i}`,
  refund_amount_cents: 0,
}))
const steps = ["welcome", "branding", "product", "payouts", "onepage", "sale"].map((id, i) => ({
  id, title: id, description: `${id} step`, tooltip: "", completed: i < 4, href: "/app",
}))

function Cards({ n = 24 }: { n?: number }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Page</h1>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
      ))}
    </div>
  )
}

function PaneBar() {
  return (
    <div data-pane-bar="" className="sticky top-0 z-10 flex h-[64px] items-center border-b border-[#e5e7eb] bg-white px-4">
      <span className="text-[18px] font-bold text-[#1a1a2e]">Orders</span>
    </div>
  )
}

function Page({ path }: { path: string }) {
  if (path === "/app") {
    return (
      <DashboardClient
        creatorId="c1"
        displayName="Calvin"
        initialSetupSteps={steps as never}
        productIds={["p0", "p1", "p2", "p3", "p4", "p5"]}
        initialOrders={orders as never}
        creatorHandle="calvin"
        websiteDomain="calvin.com"
        websitePublished
        brandingDetail={{ hasAvatar: true, hasName: true, hasBio: true } as never}
        sharePlatforms={[]}
      />
    )
  }
  if (path === "/app/analytics") {
    return (
      <div data-page="analytics" className="page-scroll h-full overflow-y-auto bg-[#fafafa] app-page-enter">
        <TryProStrip />
        <Cards />
      </div>
    )
  }
  if (path === "/app/payouts") {
    return (
      <div data-page="payouts" className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter">
        <TryProStrip />
        <PaneBar />
        <Cards />
      </div>
    )
  }
  if (path === "/app/orders") {
    return (
      <div data-page="orders" className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa]">
        <div className="orders-pane page-scroll absolute inset-0 overflow-y-auto">
          <PaneBar />
          <Cards />
        </div>
      </div>
    )
  }
  if (path === "/app/products") {
    return (
      <div data-page="products" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa] app-page-enter">
        <Cards />
      </div>
    )
  }
  return (
    <div data-page="settings" className="bg-[#f8f9fa]">
      <Cards />
    </div>
  )
}

function Shell() {
  const path = usePathname()
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
      <AppSidebar
        creatorSlug="calvin"
        username="calvin"
        storePublished
        displayName="Calvin"
        stripeConnected
        stripeStatus="connected"
        onePagePublished
        setupProgress={{ completed: 4, total: 7 }}
        businesses={[]}
      />
      <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white overflow-hidden app-main-content">
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
          <Page key={path} path={path} />
        </div>
      </main>
    </div>
  )
}

const cold = new URLSearchParams(location.search).get("cold") === "1"
createRoot(document.getElementById("app")!).render(
  cold ? (
    <AppColdStart />
  ) : (
    <SWRProvider>
      <LocaleProvider>
        <LanguageProvider>
          <Suspense fallback={null}>
            <AppStage />
          </Suspense>
          <Shell />
        </LanguageProvider>
      </LocaleProvider>
    </SWRProvider>
  ),
)
w.__ran = true

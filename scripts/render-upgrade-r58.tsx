/**
 * Round 58: the plans page in the app (/app/settings/billing/upgrade) and the
 * public /pricing page, drawn by their real components, for
 * scripts/check-upgrade-r58.mjs.
 *
 *   /pricing                          the public page's client, on its own
 *   /app/settings?tab=billing         a Billing stand in with the real Upgrade link
 *   /app/settings/billing/upgrade     the real layout (a layer) and the real client
 *
 * A router of a few addresses stands in for Next's, as in
 * scripts/render-layer-motion.tsx: a push writes the history and swaps the
 * page in a transition (one commit), and a popstate draws the address it
 * landed on. Bundled against the React the app router runs (Next's own
 * build, which has <ViewTransition>).
 *
 * `?current=growth&active=1` draws the page for somebody on Grow with a live
 * subscription; nothing given is somebody on Free.
 */
import React, { startTransition } from "react"
import { createRoot } from "react-dom/client"
import * as probeNavigation from "next/navigation"
import Link from "next/link"
import UpgradeLayout from "@/app/(storelib)/app/settings/billing/upgrade/layout"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { PricingPageClient } from "@/app/(storelib)/(marketing)/pricing/pricing-client"
import { AppStage } from "@/components/app/app-stage"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"

const { __RouteContext } = probeNavigation as typeof probeNavigation & { __RouteContext: React.Context<{ path: string; search: string }> }

type W = Window & { __navigate: (h: string, how?: "push" | "replace") => void; __back: () => void; __path: string; __commits: Array<{ at: number; path: string }> }
const w = window as unknown as W
w.__commits = []

const q = new URLSearchParams(location.search)
const currentPlanId = q.get("current") || "free"
const active = q.get("active") === "1"
/* The rows as the database seeds them: the stored Grow price is old on purpose, the page must draw the code's. */
const plans = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null },
  { id: "growth", name: "Growth", price_cents: 2900, billing_period: "month" },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month" },
]

function BillingStandIn() {
  return (
    <div data-billing-stand-in="" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Settings</h1>
        <div className="mt-5 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] text-[#6b7280]">Current plan</p>
          <p className="mt-1 text-[20px] font-semibold text-[#1a1a2e]">Free</p>
          <Link href="/app/settings/billing/upgrade" data-probe-upgrade="" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white no-underline">
            Upgrade to Grow
          </Link>
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="mt-3 h-16 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        ))}
      </div>
    </div>
  )
}

function Page({ path }: { path: string }) {
  if (path === "/app/settings/billing/upgrade") {
    return (
      <UpgradeLayout>
        <UpgradePageClient plans={plans} currentPlanId={currentPlanId} hasActiveSubscription={active} />
      </UpgradeLayout>
    )
  }
  return <BillingStandIn />
}

function Committed({ path }: { path: string }) {
  React.useLayoutEffect(() => {
    w.__path = path
    w.__commits.push({ at: performance.now(), path })
  }, [path])
  return null
}

function Routed() {
  const [route, setRoute] = React.useState({ path: location.pathname, search: location.search })
  React.useEffect(() => {
    w.__navigate = (h, how = "push") => {
      if (how === "replace") history.replaceState({ __NA: true }, "", h)
      else history.pushState({ __NA: true }, "", h)
      const url = new URL(h, location.href)
      startTransition(() => setRoute({ path: url.pathname, search: url.search }))
    }
    w.__back = () => history.back()
    const onPop = () => startTransition(() => setRoute({ path: location.pathname, search: location.search }))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  return (
    <__RouteContext.Provider value={route}>
      <div style={{ position: "fixed", inset: 0 }}>
        <header data-shell-chrome="" data-probe-header="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
        <main className="h-full overflow-hidden bg-[#f8f9fa] pt-[68px] md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll relative h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
            <Page path={route.path} />
          </div>
        </main>
        <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style={{ paddingBottom: 6 }}>
          <div className="pointer-events-auto h-[58px] w-[300px] rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
        </div>
        <AppStage />
        <NavigationLoadingBar />
        <Committed path={route.path} />
      </div>
    </__RouteContext.Provider>
  )
}

const mount = document.getElementById("app")!
if (location.pathname === "/pricing") {
  createRoot(mount).render(<PricingPageClient />)
} else {
  document.documentElement.classList.add("app-layout")
  createRoot(mount).render(<Routed />)
}

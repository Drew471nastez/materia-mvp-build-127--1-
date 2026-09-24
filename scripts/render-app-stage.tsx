/**
 * The real shell pieces that decide how an /app page arrives (the top bar,
 * AppStage and its spinner for a slow page) over a shell shaped like
 * app/app/layout.tsx, with a router that is only what these components can
 * see of one: an address that changes when the new page commits, with the
 * new page, in the same render.
 *
 * `window.__delay` is how long the "server" takes. A click on a link starts
 * a navigation the way the real bar sees it (a click on an <a>), and the
 * router commits `__delay` ms later. A second click before that replaces the
 * first, as the real router does: only the latest one commits. Back and
 * forward are the browser's own. `__startNav` is the call a push makes
 * (startNavigationLoading), for the press that goes nowhere.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { NavigationLoadingBar, startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"

type W = Window & {
  __delay: number
  __navigate: (href: string) => void
  __commit: (href: string) => void
  __startNav: (href: string) => void
}
const w = window as unknown as W
w.__delay = 80
w.__startNav = startNavigationLoading

let latest = 0
w.__navigate = (href: string) => {
  const mine = ++latest
  window.setTimeout(() => {
    if (mine !== latest) return
    window.history.pushState(null, "", href)
    w.__commit(href)
  }, w.__delay)
}
window.addEventListener("popstate", () => {
  const href = window.location.pathname + window.location.search
  window.setTimeout(() => w.__commit(href), w.__delay)
})

function Page({ id }: { id: string }) {
  return (
    <div data-page={id} className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{id}</h1>
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
        ))}
      </div>
      {/* A page with something fixed to the window showing: the landing must not move it. */}
      {id === "fixed" && <div data-fixed-bar="" className="fixed inset-x-0 bottom-0 h-16 border-t bg-white" />}
    </div>
  )
}

function Shell() {
  const path = usePathname()
  const id = path === "/app" ? "home" : path.split("/").pop() || "home"
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]">
        <nav className="flex h-full items-center gap-4 px-4 text-[13px] text-white/90">
          {["/app", "/app/orders", "/app/analytics", "/app/fixed", "/app/products/abc", "/app/products"].map((href) => (
            <a
              key={href}
              href={href}
              data-to={href}
              onClick={(e) => {
                e.preventDefault()
                w.__navigate(href)
              }}
            >
              {href}
            </a>
          ))}
        </nav>
      </header>
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <Page key={id} id={id} />
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <Suspense fallback={null}>
      <NavigationLoadingBar />
      <AppStage />
    </Suspense>
    <Shell />
  </>,
)

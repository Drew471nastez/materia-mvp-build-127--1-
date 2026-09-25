/**
 * The shell pieces that move when an /app page swaps (AppStage's landing and
 * scroll, the top bar, the slow page surface) over a shell with the same
 * boxes and classes as app/app/layout.tsx, and pages shaped the way the real
 * ones scroll. Bundled by scripts/check-scrollbar-stable.mjs.
 *
 * Two kinds of page, because the real ones are two kinds:
 *
 *   the shell scrolls them     Settings, Storelib AI, Customers, Courses: a
 *                              box of content in .app-content-scroll, which
 *                              is what moves
 *   they scroll themselves     Home, Products, Orders, Coupons, Analytics,
 *                              Payouts, Emails, Website: an h-full box with
 *                              overflow-y: auto directly inside it
 *
 * and one of each length, plus a page exactly as tall as the scroller less
 * 2px, the one the 5px rise of the landing pushes over the edge.
 *
 *   /app/sites       the shell scrolls it, short
 *   /app/settings    the shell scrolls it, long
 *   /app/fits        the shell scrolls it, 2px short of the scroller
 *   /app/products    scrolls itself (.orders-pane.page-scroll), long
 *   /app/coupons     scrolls itself, short
 *   /app             the dashboard's .dashboard-scroll-container, long
 *   /app/orders      the orders stage and its pane
 *   /app/products/x  the product editor's layout around an editor-shaped page
 *
 * Every page's column is the one in CLAUDE.md, marked [data-content], so the
 * probe can say whether it moved.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import EditProductLayout from "@/app/app/products/[id]/layout"
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"

type W = Window & { __delay: number; __navigate: (href: string) => void; __commit: (href: string) => void }
const w = window as unknown as W
w.__delay = 80
watchRouterStarts()

let latest = 0
w.__navigate = (href: string) => {
  noteRouterStart()
  const mine = ++latest
  window.setTimeout(() => {
    if (mine !== latest) return
    window.history.pushState({ __NA: true }, "", href)
    w.__commit(href)
  }, w.__delay)
}
window.addEventListener("popstate", () => {
  const href = window.location.pathname + window.location.search
  window.setTimeout(() => w.__commit(href), w.__delay)
})

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

function Page({ path }: { path: string }) {
  switch (path) {
    case "/app/sites":
      return <div data-page="sites"><div data-content="" className={COLUMN}><Cards n={2} /></div></div>
    case "/app/settings":
      return (
        <div data-page="settings" className="overflow-x-hidden bg-[#fafafa]">
          <div data-content="" className={COLUMN}><Cards n={30} /></div>
        </div>
      )
    case "/app/fits":
      /* As tall as the scroller, less 2px: it fits, until something moves it 5px down. */
      return (
        <div data-page="fits" className="h-[calc(100svh-58px-2px)] overflow-hidden bg-[#fafafa]">
          <div data-content="" className={COLUMN}><Cards n={1} /></div>
        </div>
      )
    case "/app/products":
      return (
        <div data-page="products" className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
          <div data-content="" className={COLUMN}><Cards n={30} /></div>
        </div>
      )
    case "/app/coupons":
      return (
        <div data-page="coupons" className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
          <div data-content="" className={COLUMN}><Cards n={1} /></div>
        </div>
      )
    case "/app":
      return (
        <div data-page="home" className="h-full overflow-y-auto bg-[#f8f9fa] dashboard-scroll-container relative app-page-enter">
          <div data-content="" className={COLUMN}><Cards n={30} /></div>
          {/* The dashboard's own scrollbar rules (components/app/dashboard-client.tsx). */}
          <style>{`.dashboard-scroll-container{scrollbar-width:thin;scrollbar-color:rgba(156,163,175,.5) transparent}.dashboard-scroll-container::-webkit-scrollbar{width:6px}@media (max-width:768px){.dashboard-scroll-container{scrollbar-width:none}}`}</style>
        </div>
      )
    case "/app/orders":
      return (
        <div data-page="orders" className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa] app-page-enter">
          <div className="orders-pane page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div data-content="" className={COLUMN}><Cards n={30} /></div>
          </div>
        </div>
      )
    case "/app/products/x":
      return (
        <EditProductLayout>
          <div data-page="editor" data-product-editor="" className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa]">
            <div data-editor-bar="" className="sticky top-0 z-30 h-16 bg-[#f8f9fa]" />
            <div data-editor-column="" className="mx-auto w-full max-w-[760px] px-4 sm:px-6"><Cards n={30} /></div>
          </div>
        </EditProductLayout>
      )
    default:
      return <div data-page="other" />
  }
}

const LINKS = ["/app", "/app/sites", "/app/settings", "/app/fits", "/app/products", "/app/coupons", "/app/orders", "/app/products/x"]

function Shell() {
  const path = usePathname()
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
        <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
          <Page key={path} path={path} />
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

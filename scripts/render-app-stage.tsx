/**
 * The real shell pieces that decide how an /app page arrives (the top bar,
 * AppStage and its spinner for a slow page) over a shell shaped like
 * app/(storelib)/app/layout.tsx, with a router that is only what these components can
 * see of one: an address that changes when the new page commits, with the
 * new page, in the same render.
 *
 * `window.__delay` is how long the "server" takes. A click on a link starts
 * a navigation the way the real bar sees it (a click on an <a>, whose
 * default the Link prevents, with the router counting its start the way
 * instrumentation-client.ts does), and the router commits `__delay` ms
 * later. A second click before that replaces the first, as the real router
 * does: only the latest one commits. Back and forward are the browser's own.
 * `__startNav` is the call a push makes (startNavigationLoading), for the
 * press that goes nowhere.
 *
 * The ways a navigation can end without a plain new page, each as the real
 * router would leave them:
 *
 *   /app/orders?view=open   the same page, a new query
 *   /app/redirect           the server sends it on: /app/analytics commits
 *   /app/same               the server sends it back where it started: the
 *                           router writes its commit (history state `__NA`)
 *                           at the address already showing, nothing moves
 *   /app/boom               the page throws: the /app error boundary
 *                           (app/(storelib)/app/error.tsx, the real one)
 *   /app/missing            the not-found page (app/(storelib)/app/not-found.tsx)
 *   /app/hang               never answers
 *   [data-handled]          a link the page handles itself: nothing starts
 *   __throwHere()           the page showing throws, the address unchanged
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { NavigationLoadingBar, startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { AppStage, PageLanded } from "@/components/app/app-stage"
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import AppError from "@/app/(storelib)/app/error"
import { AppNotFoundBody } from "@/components/app/app-not-found-body"

type W = Window & {
  __delay: number
  __navigate: (href: string) => void
  __commit: (href: string) => void
  __startNav: (href: string) => void
  __throwHere: () => void
}
const w = window as unknown as W
w.__delay = 80
w.__startNav = startNavigationLoading
watchRouterStarts()

let latest = 0
w.__navigate = (href: string) => {
  noteRouterStart()
  const mine = ++latest
  if (href === "/app/hang") return
  window.setTimeout(() => {
    if (mine !== latest) return
    if (href === "/app/same") {
      /* Next's HistoryUpdater, for a commit at the address already showing. */
      window.history.replaceState({ __NA: true }, "", window.location.href)
      return
    }
    const to = href === "/app/redirect" ? "/app/analytics" : href
    window.history.pushState({ __NA: true }, "", to)
    w.__commit(to)
  }, w.__delay)
}
window.addEventListener("popstate", () => {
  const href = window.location.pathname + window.location.search
  window.setTimeout(() => w.__commit(href), w.__delay)
})

let throwHere: () => void = () => {}
w.__throwHere = () => throwHere()

class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) return <AppError error={this.state.error} reset={() => this.setState({ error: null })} />
    return this.props.children
  }
}

function Page({ id }: { id: string }) {
  const [broken, setBroken] = React.useState(false)
  React.useEffect(() => {
    throwHere = () => setBroken(true)
  }, [])
  if (broken || id === "boom") throw new Error("probe: the page threw")
  if (id === "missing") return <><PageLanded /><AppNotFoundBody tt={text => text} /></>
  return (
    <div data-page={id} className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]">
      {/* Home's top is the violet announcement bar (components/app/dashboard-client.tsx):
          the spinner's rounded corners must never show it. */}
      {id === "home" && <div data-violet-bar="" className="h-[40px] bg-[#8b5cf6]" />}
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{id}</h1>
        <button type="button" data-page-button="" className="mt-3 h-11 rounded-lg bg-white px-4" onClick={() => { (window as unknown as { __pagePresses: number }).__pagePresses = ((window as unknown as { __pagePresses?: number }).__pagePresses ?? 0) + 1 }}>
          A control on the page
        </button>
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} className="mt-3 h-24 rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
        ))}
      </div>
      {/* A page with something fixed to the window showing: the landing must not move it. */}
      {id === "fixed" && <div data-fixed-bar="" className="fixed inset-x-0 bottom-0 h-16 border-t bg-white" />}
    </div>
  )
}

const LINKS = ["/app", "/app/orders", "/app/analytics", "/app/fixed", "/app/products/abc", "/app/products", "/app/orders?view=open", "/app/redirect", "/app/same", "/app/boom", "/app/missing", "/app/hang"]

function Shell() {
  const path = usePathname()
  const id = path === "/app" ? "home" : path.split("/").pop() || "home"
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]">
        <nav className="flex h-full items-center gap-2 overflow-hidden px-2 text-[9px] text-white/90">
          {LINKS.map((href) => (
            <a
              key={href}
              href={href}
              data-to={href}
              onClick={(e) => {
                e.preventDefault()
                w.__navigate(href)
              }}
            >
              {href.replace("/app", "") || "/"}
            </a>
          ))}
          <a href="/app/elsewhere" data-handled="" onClick={(e) => e.preventDefault()}>
            handled
          </a>
        </nav>
      </header>
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <Boundary key={id}>
            <Page id={id} />
          </Boundary>
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

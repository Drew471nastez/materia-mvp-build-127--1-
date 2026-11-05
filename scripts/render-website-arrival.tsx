/**
 * THE WEBSITE PAGE ARRIVING, IN THE SHELL, FOR scripts/check-website-arrival.mjs.
 *
 * The real shell pieces that decide how an /app page arrives (the top bar
 * and AppStage with its spinner for a slow page, over a shell shaped like
 * app/(storelib)/app/layout.tsx), the real Website page (WebsiteBuilderClient) with a
 * library of four websites whose covers the probe's server answers, a plain
 * list page to come from, and a dark full screen standing in for the editor.
 * The router is what these components can see of one: an address that
 * changes when the new page commits, `window.__delay` ms after the press,
 * in a transition as Next's router does (the probe's next/navigation).
 *
 *   __navigate(href)       a press on a link: the router commits later
 *   __newCover(id, url)    the editor took a new picture of a website while
 *                          the page was away (lib/website-builder/cover-refresh)
 *   ?before=1              the Website page as it was at BEFORE_REV (the probe builds that one
 *                          from a copy of this file)
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { AppStage } from "@/components/app/app-stage"
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"
import { seedCover } from "@/lib/website-builder/cover-refresh"

type W = Window & {
  __delay: number
  __navigate: (href: string) => void
  __commit: (href: string) => void
  __newCover: (id: string, url: string) => void
}
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
    ;(window as unknown as { __commitAt: number }).__commitAt = performance.timeOrigin + performance.now()
    w.__commit(href)
  }, w.__delay)
}
w.__newCover = (id: string, url: string) => seedCover(id, { url, mobile_url: null, updated_at: new Date().toISOString() })

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
function site(id: string, name: string, status: WebsiteSummary["status"], minutes: number): WebsiteSummary {
  return {
    id,
    name,
    status,
    theme_id: "storelib-default",
    created_at: ago(60 * 48),
    updated_at: ago(minutes),
    published_at: status === "published" ? ago(minutes) : null,
    /* Taken after the last save, so the page does not ask for another. */
    snapshot_url: `/covers/${id}-v1.webp`,
    snapshot_mobile_url: null,
    snapshot_updated_at: ago(Math.max(0, minutes - 1)),
    saved_at: ago(minutes),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  }
}
const INSTALLS: WebsiteSummary[] = [
  site("live-1", "Northwind", "published", 4),
  site("lib-0", "Studio", "draft", 120),
  site("lib-1", "Atelier", "draft", 180),
  site("lib-2", "Coach", "draft", 240),
]

/** A page to come from: the list shape most /app pages have. */
function ListPage() {
  return (
    <div data-page="products" className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Products</h1>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="mt-3 flex h-16 items-center gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white px-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <span className="h-[50px] w-[50px] rounded-[11px] bg-[#d9cbb6]" />
            <span className="text-[14px] font-medium text-[#1a1a2e]">Product {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The editor: a page of its own, dark, the whole screen. */
function EditorPage() {
  return <div data-page="editor" className="fixed inset-0 z-[60] bg-[#18181b]" />
}

function Page({ path }: { path: string }) {
  if (path === "/app/website-builder") {
    return (
      <div data-page="website" className="h-full">
        <WebsiteBuilderClient installs={INSTALLS} username="northwind" />
      </div>
    )
  }
  if (path === "/editor") return <EditorPage />
  return <ListPage />
}

const LINKS = ["/app/products", "/app/website-builder", "/editor"]

function Shell() {
  const path = usePathname()
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]">
        <nav className="flex h-full items-center gap-4 px-4 text-[12px] text-white/90">
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
              {href}
            </a>
          ))}
        </nav>
      </header>
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
          <Page key={path} path={path} />
        </div>
      </main>
    </div>
  )
}

/* The probe's router (its next/navigation): the address, changed in a transition when the page commits. */
const Router = (window as unknown as { __ProbeRouter: React.ComponentType<{ children: React.ReactNode }> }).__ProbeRouter

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <Router>
    <TooltipProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
        <AppStage />
      </Suspense>
      <Shell />
    </TooltipProvider>
  </Router>,
)

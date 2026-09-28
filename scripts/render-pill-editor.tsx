/**
 * The Products list, the product editor as a layer, and THE REAL NAV PILL
 * over both, with the shell pieces that decide how a page arrives (AppStage,
 * the navigation bar's listeners) and a router of a few addresses in place
 * of Next's.
 *
 * scripts/check-pill-nav-from-editor.mjs drives it. Nothing about the pill,
 * the layer or the editor is reimplemented: the pill is
 * components/app/sidebar-mobile-nav's own MobileNavPill, wired exactly as
 * components/app/sidebar.tsx wires it (startNavigationLoading, then
 * router.push), and the shell's boxes are the ones app/app/layout.tsx draws
 * — the pill beside <main>, the page inside `.app-content-scroll`, so the
 * stills page-layer.tsx builds land where they land in the app.
 */
import React, { startTransition, use } from "react"
import { createRoot } from "react-dom/client"
import * as nextNavigation from "next/navigation"
import { useRouter } from "next/navigation"

/*
  The stand-in router's own context, which only the stub this probe bundles
  in place of next/navigation has (scripts/check-pill-nav-from-editor.mjs).
  Read off the module rather than imported by name, so this file typechecks
  against the real one as the rest of the repo does.
*/
const __RouteContext = (nextNavigation as unknown as {
  __RouteContext: React.Context<{ path: string; search: string }>
}).__RouteContext
import { ProductsClient } from "@/app/app/products/products-client"
import { ProductEditor } from "@/app/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/app/products/new/editor-form"
import { PageLayer } from "@/components/app/page-layer"
import { AppStage } from "@/components/app/app-stage"
import { NavigationLoadingBar, startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { MobileNavPill, pillBelongsOn } from "@/components/app/sidebar-mobile-nav"
import { NAV_ICONS, NAV_ICONS_EXTRA } from "@/components/app/sidebar-desktop-nav"
import { LanguageProvider } from "@/lib/i18n"

type W = Window & {
  __slowMs: number
  __navigate: (h: string, how?: "push" | "replace") => void
  __back: () => void
  __path: string
  __pushes: string[]
  __picks: string[]
  __pillCommits: Array<{ at: number; path: string }>
}
const w = window as unknown as W
w.__slowMs = 0
w.__pillCommits = []
w.__pushes = []
w.__picks = []

function jpeg(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement("canvas")
  c.width = width
  c.height = height
  const g = c.getContext("2d")
  if (!g) return ""
  draw(g)
  return c.toDataURL("image/jpeg", 0.8)
}
const pics = new Map<string, string>()
const pic = (hue: number) => {
  const key = `pic${hue}`
  if (!pics.has(key)) pics.set(key, jpeg(640, 360, (g) => { g.fillStyle = `hsl(${hue},60%,78%)`; g.fillRect(0, 0, 640, 360) }))
  return pics.get(key) as string
}
const cover = (hue: number) => {
  const key = `cover${hue}`
  if (!pics.has(key)) {
    pics.set(key, jpeg(80, 80, (g) => {
      g.fillStyle = `hsl(${hue},45%,72%)`
      g.fillRect(0, 0, 80, 80)
    }))
  }
  return pics.get(key) as string
}

function loadedFor(id: string): LoadedProduct {
  return {
    product: {
      id,
      creator_id: "c1",
      title: `Product ${id}`,
      description: "<p>Forty presets made on real client sessions.</p>".repeat(4),
      price_cents: 2900,
      compare_at_cents: null,
      slug: `product-${id}`,
      type: "digital",
      status: "published",
      show_sales_badge: false,
      refund_policy_enabled: false,
      refund_policy_type: "14_day",
      seo_title: null,
      seo_description: null,
      call_to_action: "Buy Now",
      category: "Photography",
      pay_what_you_want: false,
      thumbnail_url: pic(260),
      gallery_urls: [pic(260), pic(20)],
      whats_included: ["40 presets", "Before and after files"],
      faqs: [{ question: "Which apps?", answer: "Lightroom and Capture One." }],
    },
    assets: [],
    variants: [],
  } as unknown as LoadedProduct
}

const shelf = Array.from({ length: 24 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: `Product ${i + 1}`,
  type: "digital",
  price_cents: 1200 + i * 350,
  status: i % 5 === 2 ? "draft" : "published",
  thumbnail_url: cover(i * 37),
  slug: `product-${i}`,
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(),
  archived: false,
  sales_count: i % 3 === 0 ? 12 * i : 0,
}))

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  if (url.startsWith("/api/")) return new Response(JSON.stringify({ error: "not in the probe" }), { status: 404, headers: { "Content-Type": "application/json" } })
  return realFetch(input, init)
}

/** A plain page, the way Home, Orders, Analytics and Settings stand in here. */
function Plain({ path }: { path: string }) {
  return (
    <div className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]" data-plain-page={path}>
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">{path}</h1>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="mt-3 h-16 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 text-[15px] text-[#1a1a2e]">Row {i + 1}</div>
        ))}
      </div>
    </div>
  )
}

type Route = { path: string; search: string; gate: Promise<void> | null }
const gateFor = () => (w.__slowMs > 0 ? new Promise<void>((resolve) => window.setTimeout(resolve, w.__slowMs)) : null)

function Waiting({ gate }: { gate: Promise<void> | null }) {
  if (gate) use(gate)
  return null
}

function Page({ path }: { path: string }) {
  if (path === "/app/products") return <ProductsClient products={shelf as never} creatorUsername="astrid" />
  if (path.startsWith("/app/products/")) {
    const id = path.split("/").pop() as string
    return (
      <PageLayer pill inset="bar" phoneOnly>
        <ProductEditor key={path} creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={id === "new" ? null : loadedFor(id)} />
      </PageLayer>
    )
  }
  return <Plain path={path} />
}

function Committed({ path }: { path: string }) {
  React.useLayoutEffect(() => {
    w.__path = path
    w.__pillCommits.push({ at: performance.now(), path })
  }, [path])
  return null
}

/* The pill, wired the way components/app/sidebar.tsx wires it, and nothing else. */
function Pill() {
  const router = useRouter()
  return (
    <MobileNavPill
      menuOpen={false}
      onToggleMenu={() => {}}
      onCloseMenu={() => {}}
      onNavigate={(href) => {
        w.__picks.push(href)
        startNavigationLoading(href)
        router.push(href)
      }}
      onPrefetch={(href) => router.prefetch(href, { kind: "full" } as never)}
      icons={{
        home: NAV_ICONS.dashboard,
        orders: NAV_ICONS.orders,
        products: NAV_ICONS.products,
        analytics: NAV_ICONS.analytics,
        settings: NAV_ICONS_EXTRA.settings,
      }}
    />
  )
}

function Routed() {
  const [route, setRoute] = React.useState<Route>({ path: location.pathname, search: location.search, gate: null })
  React.useEffect(() => {
    const push = history.pushState.bind(history)
    const replace = history.replaceState.bind(history)
    let ours = false
    w.__navigate = (h, how = "push") => {
      w.__pushes.push(h)
      ours = true
      if (how === "replace") replace({ __NA: true }, "", h)
      else push({ __NA: true }, "", h)
      ours = false
      const url = new URL(h, location.href)
      const gate = gateFor()
      startTransition(() => setRoute({ path: url.pathname, search: url.search, gate }))
    }
    w.__back = () => history.back()
    const sync = () => {
      if (ours) return
      startTransition(() => setRoute((r) => (r.path === location.pathname ? { ...r, search: location.search, gate: null } : r)))
    }
    history.pushState = (d, u, url) => { push(d, u, url); sync() }
    history.replaceState = (d, u, url) => { replace(d, u, url); sync() }
    const onPop = () => {
      const gate = gateFor()
      startTransition(() => setRoute({ path: location.pathname, search: location.search, gate }))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  return (
    <__RouteContext.Provider value={{ path: route.path, search: route.search }}>
      <div style={{ position: "fixed", inset: 0 }}>
        <header data-shell-chrome="" data-probe-header="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
        {pillBelongsOn(route.path) ? <Pill /> : null}
        <main className="app-main-content h-full overflow-hidden bg-[#f8f9fa] pt-[68px] md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll relative h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
            <Waiting gate={route.gate} />
            <Page path={route.path} />
          </div>
        </main>
        <AppStage />
        <NavigationLoadingBar />
        <Committed path={route.path} />
      </div>
    </__RouteContext.Provider>
  )
}

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Routed />
  </LanguageProvider>,
)

/**
 * The Products list, the product editor (new and saved), the Orders page
 * and the email composer (in its real route layout, left through the real
 * app/app/emails/layer-nav.ts) as the app draws them, with the shell pieces that decide how a page
 * arrives (AppStage, the navigation bar's listeners) and a router of a few
 * addresses in place of Next's. Bundled by scripts/check-layer-motion.mjs
 * against the React the app router runs (Next's own build, which has
 * <ViewTransition>), so a layer's rise and drop are React's own view
 * transitions at a real commit.
 *
 * The stand-in router: a push or a replace writes the history and swaps the
 * page in a transition, one commit, the way the real router does, with the
 * address (usePathname, useSearchParams) changing in the same commit. A
 * popstate (router.back(), the browser's back) draws the address it landed
 * on, the same way. `window.__slowMs` is how long the "server" takes: the
 * new page suspends that long inside the transition, so the page you were on
 * stays, live, as it does behind Next's router while a page is fetched.
 * history.pushState from a page (Orders opening an order) is synced into
 * useSearchParams in a transition, as Next does.
 */
import React, { startTransition, use } from "react"
import { createRoot } from "react-dom/client"
import { __RouteContext } from "next/navigation"
import { ProductsClient } from "@/app/app/products/products-client"
import { ProductEditor } from "@/app/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/app/products/new/editor-form"
import { OrdersClient } from "@/app/app/orders/orders-client"
import { PageLayer } from "@/components/app/page-layer"
import { AppStage } from "@/components/app/app-stage"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"
import { fixtureRows } from "./render-orders-probe"
import NewEmailLayout from "@/app/app/emails/new/layout"
import { ComposePage } from "@/components/email/compose/compose-page"
import { layerLinkClick } from "@/app/app/emails/layer-nav"
import Link from "next/link"
import { useRouter } from "next/navigation"

type W = Window & {
  __slowMs: number
  __navigate: (h: string, how?: "push" | "replace") => void
  __back: () => void
  __path: string
  __commits: Array<{ at: number; path: string }>
}
const w = window as unknown as W
w.__slowMs = 0
w.__commits = []

/*
  PICTURES AS THE APP HAS THEM: bitmaps (JPEG), not SVG. Chromium decodes a
  bitmap off the main thread; an SVG <img> is drawn on it, every time it is
  painted, which put a picture drawing inside the frames of every move here
  that the app, whose pictures are JPEG and WebP, never has.
*/
function jpeg(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
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
      g.fillStyle = `hsl(${hue},40%,35%)`
      g.beginPath()
      g.arc(40, 44, 18, 0, Math.PI * 2)
      g.fill()
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
      description: "<p>Forty presets made on real client sessions, with before and after files for each one.</p>".repeat(4),
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

const now = Date.UTC(2026, 8, 20, 12)
const orderRows = fixtureRows(now)
/* The same objects on every draw, as the server page hands them once: a new array each time made the memoised list draw again. */
const orderProducts = [
  { id: "p1", title: "Lightroom preset pack" },
  { id: "p2", title: "Brush set for Procreate" },
  { id: "p3", title: "Portrait course" },
]
const noColumns: never[] = []

/*
  The composer's server, stood in for: the audience it reads as it opens,
  and nothing else it needs to open and close.
*/
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  if (url.startsWith("/api/email/audience")) {
    return reply(200, {
      options: [{ type: "all", label: "All subscribers", count: 1204 }],
      segments: [],
      plan: { limit: 2000, used: 212 },
      brand: { name: "Ana Pop Studio", logoUrl: null, storeUrl: "https://storelib.com/anapop", accent: "#0f766e", address: "12 Harbour Street", avatarUrl: null },
      upgraded: true,
    })
  }
  if (url.startsWith("/api/")) return reply(404, { error: "Not in the probe" })
  return realFetch(input, init)
}

/*
  The Emails page, stood in for by its bar and a list of rows (the real one
  reads its lists from the server): New email is the real link, opened
  through app/app/emails/layer-nav.ts as emails-home.tsx opens it.
*/
function EmailsStandIn() {
  const router = useRouter()
  return (
    <div className="page-scroll h-full overflow-y-auto bg-[#f8f9fa]" data-emails-stand-in="">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-bold text-[#1a1a2e]">Emails</h1>
          <Link href="/app/emails/new" onClick={layerLinkClick(router, "/app/emails/new")} data-new-email="" className="inline-flex h-10 items-center rounded-lg bg-[#8b5cf6] px-3 text-[15px] font-medium text-white">
            New email
          </Link>
        </div>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="mt-3 flex h-16 items-center rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 text-[15px] text-[#1a1a2e]">
            Campaign {i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

type Route = { path: string; search: string; gate: Promise<void> | null }
const gateFor = () => (w.__slowMs > 0 ? new Promise<void>((resolve) => window.setTimeout(resolve, w.__slowMs)) : null)

/* The page's data, still on its way: suspends the transition, so the page showing stays. */
function Waiting({ gate }: { gate: Promise<void> | null }) {
  if (gate) use(gate)
  return null
}

function Page({ path }: { path: string }) {
  if (path === "/app/products") {
    return <ProductsClient products={shelf as never} creatorUsername="astrid" />
  }
  if (path.startsWith("/app/products/")) {
    const id = path.split("/").pop() as string
    return (
      <PageLayer pill inset="bar" phoneOnly>
        <ProductEditor key={path} creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={id === "new" ? null : loadedFor(id)} />
      </PageLayer>
    )
  }
  if (path === "/app/emails") return <EmailsStandIn />
  if (path === "/app/emails/new") {
    return (
      <NewEmailLayout>
        <ComposePage campaignId={null} />
      </NewEmailLayout>
    )
  }
  if (path === "/app/orders") {
    return (
      <OrdersClient
        rows={orderRows}
        products={orderProducts}
        hiddenColumns={noColumns}
        stripeConnected
        initialRange={null}
        timeZone="UTC"
        now={now}
      />
    )
  }
  return <div data-other-page="" className="p-6 text-[14px] text-[#6b7280]">{path}</div>
}

function Committed({ path }: { path: string }) {
  React.useLayoutEffect(() => {
    w.__path = path
    w.__commits.push({ at: performance.now(), path })
  }, [path])
  return null
}

function Routed() {
  const [route, setRoute] = React.useState<Route>({ path: location.pathname, search: location.search, gate: null })
  React.useEffect(() => {
    const push = history.pushState.bind(history)
    const replace = history.replaceState.bind(history)
    let ours = false
    w.__navigate = (h, how = "push") => {
      ours = true
      if (how === "replace") replace({ __NA: true }, "", h)
      else push({ __NA: true }, "", h)
      ours = false
      const url = new URL(h, location.href)
      const gate = gateFor()
      startTransition(() => setRoute({ path: url.pathname, search: url.search, gate }))
    }
    w.__back = () => history.back()
    /* A page's own pushState (an order opening): Next syncs it into the router's search params in a transition. */
    const sync = () => {
      if (ours) return
      startTransition(() => setRoute((r) => (r.path === location.pathname ? { ...r, search: location.search, gate: null } : r)))
    }
    history.pushState = (d, u, url) => {
      push(d, u, url)
      sync()
    }
    history.replaceState = (d, u, url) => {
      replace(d, u, url)
      sync()
    }
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
        {/* The phone header, black as the app's is: what must never show over a rising layer. */}
        <header data-shell-chrome="" data-probe-header="" className="fixed inset-x-0 top-0 z-50 h-[68px] bg-[#111111] md:h-[58px]" />
        <main className="h-full overflow-hidden bg-[#f8f9fa] pt-[68px] md:pl-[240px] md:pt-[58px]">
          <div className="app-content-scroll relative h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">
            <Waiting gate={route.gate} />
            <Page path={route.path} />
          </div>
        </main>
        <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style={{ paddingBottom: 6 }}>
          <div id="pill" className="pointer-events-auto h-[58px] w-[300px] rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
        </div>
        <AppStage />
        <NavigationLoadingBar />
        <Committed path={route.path} />
      </div>
    </__RouteContext.Provider>
  )
}

document.documentElement.classList.add("app-layout")
/* Around the whole shell, as the root layout has it: the page's scroller stays the first box in the shell's. */
createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Routed />
  </LanguageProvider>,
)

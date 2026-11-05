/**
 * The real product editor (app/(storelib)/app/products/new/product-editor.tsx) inside a
 * copy of the /app shell's frame: the 68px (58px from 768px) header space,
 * the .app-content-scroll pane and, on a phone, a stand-in for the navigation
 * pill with the same data attribute and the same place on the screen. From
 * 768px the pane sits beside a 240px rail, as app/(storelib)/app/layout.tsx has it
 * (`md:pl-[240px]`), and the editor is inside the real PageLayer its layouts
 * use (`phoneOnly`), so the columns and the foot bar are measured in the
 * content area a creator's computer actually gives them.
 * Mounted from the rows the server page would hand it, so what is measured
 * is the first frame a creator gets. Bundled by scripts/check-product-editor.mjs.
 *
 * `?new` mounts an empty form, anything else a saved product with pictures,
 * files and a variant.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductEditor } from "@/app/(storelib)/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/(storelib)/app/products/new/editor-form"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { PageLayer } from "@/components/app/page-layer"
import { LanguageProvider } from "@/lib/i18n"
import { markTraversal, takeTraversal } from "@/lib/ui/app-navigation"

const pic = (hue: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="hsl(${hue},60%,78%)"/></svg>`)

const loaded: LoadedProduct = {
  product: {
    id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6",
    creator_id: "c1",
    title: "Portrait retouching presets, the complete set for Lightroom and Capture One",
    description: "<p>Forty presets made on real client sessions, with before and after files for each one.</p>" + "<p>Each preset was built on a real session and tested on skin tones from very fair to very deep, in daylight, tungsten and mixed light, so it holds up on the photos you actually take.</p>".repeat(5),
    price_cents: 2900,
    compare_at_cents: 3900,
    slug: "portrait-presets",
    type: "digital",
    status: "published",
    show_sales_badge: true,
    refund_policy_enabled: true,
    refund_policy_type: "14_day",
    seo_title: null,
    seo_description: null,
    call_to_action: "Buy Now",
    category: "Photography",
    pay_what_you_want: false,
    thumbnail_url: pic(260),
    gallery_urls: [pic(260), pic(20), pic(160)],
    whats_included: ["40 presets", "Before and after files", "Lifetime updates"],
    /* Four questions, so the probe can hold one and move it past the others. */
    faqs: [
      { question: "Which apps?", answer: "Lightroom Classic, Lightroom and Capture One." },
      { question: "Do they work on RAW files?", answer: "Yes, and on JPEGs." },
      { question: "Can I use them for clients?", answer: "Yes, on any paid work." },
      { question: "How do I install them?", answer: "Unzip and import the folder." },
    ],
  },
  assets: [
    { id: "a1", file_name: "portrait-presets-lightroom.zip", file_path: "c1/p/a1.zip", file_size: 48_000_000, mime_type: "application/zip" },
    { id: "a2", file_name: "portrait-presets-capture-one.zip", file_path: "c1/p/a2.zip", file_size: 52_000_000, mime_type: "application/zip" },
  ],
  variants: [],
}

const isNew = location.search.includes("new")
/* `layer`: the editor as a full screen layer over the app's header, the way
   the plans page is drawn (app/(storelib)/app/settings/billing/upgrade/layout.tsx). */
const isLayer = location.search.includes("layer")
/* `?new&course`: a new product picked as a Video course (app/(storelib)/app/products/new/kind-chooser), as the server page hands it over. */
const editor = <ProductEditor creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={isNew ? null : loaded} startAs={location.search.includes("course") ? "course" : "digital"} />

/*
  `route`: the list and the editor as the app draws them, with a router of
  two addresses in place of Next's. The stand-in router's push calls
  window.__navigate, which swaps the page in a transition, one commit, the
  way the real router does: /app/products draws the Products list in the
  shell's scroller, /app/products/<id> the editor in its PageLayer. So Back,
  Cancel and a row's press run the real moveLayer against a real commit.
*/
const cover = (hue: number) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="hsl(${hue},45%,72%)"/><circle cx="40" cy="44" r="18" fill="hsl(${hue},40%,35%)"/></svg>`)
const shelf = Array.from({ length: 14 }, (_, i) => ({
  id: i === 3 ? loaded.product.id : `p${i}`,
  creator_id: "c1",
  title: i === 3 ? String(loaded.product.title) : `Product ${i + 1}`,
  type: "digital",
  price_cents: 1200 + i * 350,
  status: i % 5 === 2 ? "draft" : "published",
  thumbnail_url: cover(i * 37),
  slug: `product-${i}`,
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(),
  archived: false,
  sales_count: i % 3 === 0 ? 12 * i : 0,
}))

/*
  The browser's own history. In `route` mode the probe serves this page at
  http://probe.test/app/products/<id>, so push and replace are
  history.pushState and replaceState, back is history.back(), and a popstate
  (back or forward, from the stand-in router or the probe) draws the address
  it landed on, marked as a traversal the way the app's popstate listener
  marks one (components/app/navigation-loading-bar.tsx) and taken at the
  commit the way the stage takes it. A mirror of the entries is kept for
  the probe to read (`__hist`). The editor starts as the only entry: opened
  directly, with no list behind it.
*/
type Hist = { stack: string[]; at: number }
const startPath = location.pathname.startsWith("/app/") ? location.pathname : `/app/products/${loaded.product.id}`
const hist: Hist = { stack: [startPath], at: 0 }
;(window as unknown as { __hist: Hist }).__hist = hist

function Routed() {
  const [path, setPath] = React.useState(startPath)
  const w = window as unknown as { __navigate: (h: string, how?: "push" | "replace") => void; __back: () => void; __path: string }
  w.__navigate = (h, how = "push") => {
    if (how === "replace") {
      hist.stack[hist.at] = h
      history.replaceState({ at: hist.at }, "", h)
    } else {
      hist.stack = [...hist.stack.slice(0, hist.at + 1), h]
      hist.at++
      history.pushState({ at: hist.at }, "", h)
    }
    React.startTransition(() => setPath(h))
  }
  w.__back = () => history.back()
  w.__path = path
  React.useEffect(() => {
    history.replaceState({ at: 0 }, "", startPath)
    const onPop = (e: PopStateEvent) => {
      hist.at = (e.state as { at?: number } | null)?.at ?? 0
      markTraversal()
      React.startTransition(() => setPath(location.pathname))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  React.useLayoutEffect(() => {
    takeTraversal()
  }, [path])
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div data-shell-chrome="" className="fixed inset-x-0 top-0 z-50 h-[68px] border-b border-[#eceef1] bg-white md:h-[58px]" />
      <main className="h-full pt-[68px] md:pt-[58px] md:pl-[240px] bg-[#f8f9fa] overflow-hidden">
        <div className="h-[calc(100svh-68px)] md:h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">
          {path === "/app/products" ? (
            <LanguageProvider>
              <ProductsClient products={shelf} creatorUsername="astrid" />
            </LanguageProvider>
          ) : !path.startsWith("/app/products/") ? (
            /* Any other page, reached from the pill: Orders, say. */
            <div data-other-page="" className="p-6 text-[14px] text-[#6b7280]">{path}</div>
          ) : (
            <PageLayer pill inset="bar" phoneOnly>
              <ProductEditor key={path} creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={loaded} />
            </PageLayer>
          )}
        </div>
      </main>
      <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style={{ paddingBottom: 6 }}>
        <div id="pill" className="pointer-events-auto h-[58px] w-[300px] rounded-full bg-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
      </div>
    </div>
  )
}

if (location.search.includes("route")) {
  document.documentElement.classList.add("app-layout")
  createRoot(document.getElementById("app")!).render(<Routed />)
} else createRoot(document.getElementById("app")!).render(
  <div style={{ position: "fixed", inset: 0 }}>
    {isLayer ? (
      <div data-page-layer="" className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-[#f8f9fa]">
        {editor}
      </div>
    ) : window.innerWidth >= 768 ? (
      <>
        <div data-shell-chrome="" data-desktop-header="" className="fixed inset-x-0 top-0 z-50 h-[58px] bg-[#131316]" />
        <aside data-shell-chrome="" data-rail="" className="fixed left-0 top-[58px] z-40 flex h-[calc(100svh-58px)] w-[240px] flex-col gap-1 border-r border-neutral-200/60 bg-white p-3">
          {["Dashboard", "Products", "Orders", "Customers", "Analytics"].map((l) => (
            <span key={l} data-rail-label="" className="block h-9 truncate rounded-lg px-3 text-[14px] leading-9 text-[#1a1a2e]">{l}</span>
          ))}
        </aside>
        <main className="h-full pt-[58px] pl-[240px] bg-white overflow-hidden">
          <div className="h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">
            <PageLayer pill inset="bar" phoneOnly>{editor}</PageLayer>
          </div>
        </main>
      </>
    ) : (
      <main className="h-full pt-[68px] md:pt-[58px] bg-[#f8f9fa] overflow-hidden">
        <div className="h-[calc(100svh-68px)] md:h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">{editor}</div>
      </main>
    )}
    <div
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden"
      style={{ paddingBottom: 6 }}
    >
      <div id="pill" className="pointer-events-auto h-[58px] w-[300px] rounded-full bg-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
    </div>
  </div>,
)

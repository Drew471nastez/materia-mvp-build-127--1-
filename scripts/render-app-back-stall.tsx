/**
 * The seller's way back out of an editor, for scripts/check-app-back-stall.mjs:
 * the real page layer (components/app/page-layer.tsx) with the real returns
 * (app/app/products/list-return.ts, app/app/coupons/list-return.ts) and the
 * real Android back handler (components/app/native-back-handler.tsx), with
 * stand-ins for the lists they go to.
 *
 * The stand-ins are the same shape as the buyer probe's product page
 * (scripts/render-checkout-motion.tsx): a teal band across the top, so a film
 * of the screen can say when the page behind is painted without knowing
 * anything about what is on it. What is under test is the way back, not the
 * list's own markup.
 *
 *   ?list=products   the products list and the product editor
 *   ?list=coupons    the coupons list and the coupon editor
 *   ?delay=160       how long the list takes to draw after the back, the time
 *                    the real router takes to bring a page it does not hold.
 *                    window.__delay overrides it while the page is up.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { useRouter } from "next/navigation"
import { NavigationLoadingBar } from "@/components/app/navigation-loading-bar"
import { PageLayer } from "@/components/app/page-layer"
import { NativeBackHandler } from "@/components/app/native-back-handler"
import { openEditor, returnToProducts, useListOrigin } from "@/app/app/products/list-return"
import { openCoupon, returnToCoupons, useCouponListOrigin } from "@/app/app/coupons/list-return"

const q = new URLSearchParams(location.search)
const LIST = q.get("list") === "coupons" ? "coupons" : "products"
const LIST_HREF = LIST === "coupons" ? "/app/coupons" : "/app/products"
const EDITOR_HREF = `${LIST_HREF}/p1`
const DELAY = Number(q.get("delay") || 160)

/* The probe can move the cost of the page behind while the page is up. */
const delay = () => {
  const d = (window as unknown as { __delay?: number }).__delay
  return typeof d === "number" ? d : DELAY
}
const later = (fn: () => void) => {
  const ms = delay()
  if (ms < 0) return
  window.setTimeout(fn, ms)
}

/* A render that costs what a real page's does: the main thread busy for a while. */
function busy(ms: number) {
  const end = performance.now() + ms
  while (performance.now() < end) {
    /* the page being drawn */
  }
}

function ListPage() {
  busy(20)
  return (
    <main data-probe-list="" className="page-scroll h-full overflow-y-auto" style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ height: 320, background: "#0f766e" }} />
      <h1 style={{ padding: 24, fontSize: 28 }}>{LIST === "coupons" ? "Coupons" : "Products"}</h1>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{ margin: "12px 16px", height: 88, borderRadius: 16, background: "#f3f4f6" }} />
      ))}
    </main>
  )
}

/** The editor, as far as the way back is concerned: a layer with a Back on it. */
function EditorBody({ onBack }: { onBack: () => void }) {
  return (
    <PageLayer phoneOnly pill inset="bar">
      <div data-probe-editor="" className="page-scroll h-full overflow-y-auto" style={{ background: "#f8f9fa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 56, padding: "0 12px", background: "#fff" }}>
          <button type="button" data-editor-back="" data-layer-back="" onClick={onBack} style={{ height: 36, padding: "0 12px", borderRadius: 10 }}>
            Back
          </button>
          <span style={{ fontWeight: 600 }}>Edit</span>
        </div>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ margin: "12px 16px", height: 96, borderRadius: 16, background: "#fff", border: "1px solid rgba(229,231,235,0.6)" }} />
        ))}
      </div>
    </PageLayer>
  )
}

function ProductEditor() {
  const router = useRouter()
  useListOrigin()
  return <EditorBody onBack={() => returnToProducts(router, null)} />
}

function CouponEditor() {
  const router = useRouter()
  useCouponListOrigin()
  return <EditorBody onBack={() => returnToCoupons(router, { id: null })} />
}

function App() {
  const router = useRouter()
  const [page, setPage] = React.useState<"list" | "editor">("list")
  React.useEffect(() => {
    history.replaceState({ __NA: true }, "", LIST_HREF)
    const onPop = () => {
      ;(window as unknown as { __navAt: number }).__navAt = performance.now()
      later(() => setPage(location.pathname === EDITOR_HREF ? "editor" : "list"))
    }
    const onNav = (e: Event) => {
      const { mode, href } = (e as CustomEvent<{ mode: string; href: string }>).detail
      ;(window as unknown as { __navAt: number }).__navAt = performance.now()
      later(() => {
        if (mode === "push") history.pushState({ __NA: true }, "", href)
        else history.replaceState({ __NA: true }, "", href)
        setPage(href === EDITOR_HREF ? "editor" : "list")
      })
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("probe-nav", onNav as EventListener)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("probe-nav", onNav as EventListener)
    }
  }, [])

  /* The way in, as the list does it: the press is the layer's own move. */
  React.useEffect(() => {
    ;(window as unknown as { __open: () => void }).__open = () => {
      if (LIST === "coupons") openCoupon(router, EDITOR_HREF)
      else openEditor(router, EDITOR_HREF)
    }
  }, [router])

  if (page === "editor") return LIST === "coupons" ? <CouponEditor /> : <ProductEditor />
  return <ListPage />
}

createRoot(document.getElementById("app")!).render(
  <>
    {/* The shell's own answer to a navigation, as app/app/layout.tsx mounts it. */}
    <React.Suspense fallback={null}>
      <NavigationLoadingBar />
    </React.Suspense>
    <NativeBackHandler />
    <App />
  </>,
)

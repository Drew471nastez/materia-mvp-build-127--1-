/**
 * The checkout (app/checkout/checkout-client.tsx) between two pages, for
 * scripts/check-checkout-motion.mjs: the real component with a fixture
 * product, and around it a stand-in for Next's router that really changes
 * the page. Its replace() and the browser's Back draw the page behind (a
 * product page, or the receipt after its loading page) DELAY ms later, the
 * time the real router takes to draw one from its cache, so a probe can
 * time what is on screen from the press to the page behind.
 *
 *   ?mode=history   the checkout was reached by a client navigation from the
 *                   product page, so Back returns through history
 *   ?mode=replace   the checkout was opened from a shared link, so Back
 *                   replaces it with the product page
 *   ?delay=160      how long the page behind takes to draw
 *   ?skeleton=1     the page's loading skeleton instead, to lay one over the other
 */
import React from "react"
import { createRoot } from "react-dom/client"
import CheckoutPageClient from "@/app/checkout/checkout-client"
import { CheckoutSkeleton } from "@/app/checkout/checkout-skeleton"
import { noteClientNavigation, notePopNavigation } from "@/lib/navigation/in-app-history"

const q = new URLSearchParams(location.search)
const MODE = q.get("mode") || "replace"
const DELAY = Number(q.get("delay") || 160)
const PRODUCT = "/lucadragoste/seo-geo-aeo-content-guide"

/* A render that costs what a real page's does: the main thread busy for a while. */
function busy(ms: number) {
  const end = performance.now() + ms
  while (performance.now() < end) {
    /* the page being drawn */
  }
}

function ProductPage() {
  busy(20)
  return (
    <main data-probe-product="" style={{ minHeight: "100vh", background: "#fff" }}>
      <div style={{ height: 320, background: "#0f766e" }} />
      <h1 style={{ padding: 24, fontSize: 28 }}>SEO + GEO/AEO Content Guide</h1>
    </main>
  )
}

function ReceiptLoading() {
  return <main data-receipt-loading="" style={{ minHeight: "100vh", background: "#f8f9fa" }} />
}

function Receipt() {
  busy(20)
  return (
    <main data-receipt="" style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <div style={{ height: 260, background: "#b45309" }} />
      <h1 style={{ padding: 24, fontSize: 28 }}>Thanks for your order</h1>
    </main>
  )
}

function App() {
  const [page, setPage] = React.useState<"product" | "checkout" | "loading" | "receipt">("checkout")
  React.useEffect(() => {
    if (MODE === "history") {
      /* Arrived here from the product page, in this tab, the way a Buy press arrives. */
      history.replaceState({}, "", PRODUCT)
      history.pushState({}, "", "/checkout" + location.search.replace(/^\?/, "?"))
      noteClientNavigation(PRODUCT)
    }
    const onPop = () => {
      notePopNavigation()
      ;(window as unknown as { __navAt: number }).__navAt = performance.now()
      window.setTimeout(() => setPage("product"), DELAY)
    }
    const onNav = (e: Event) => {
      const href = (e as CustomEvent<string>).detail
      ;(window as unknown as { __navAt: number }).__navAt = performance.now()
      if (href.startsWith("/receipt/")) {
        /* The receipt's loading page first, then the receipt: what Next does for a page with loading.tsx. */
        window.setTimeout(() => {
          history.replaceState({}, "", href)
          setPage("loading")
        }, 40)
        window.setTimeout(() => setPage("receipt"), 40 + DELAY)
        return
      }
      window.setTimeout(() => {
        history.replaceState({}, "", href)
        setPage("product")
      }, DELAY)
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("probe-nav", onNav)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("probe-nav", onNav)
    }
  }, [])
  if (page === "product") return <ProductPage />
  if (page === "loading") return <ReceiptLoading />
  if (page === "receipt") return <Receipt />
  return (
    <CheckoutPageClient
      product={{
        id: "2bfe1ed7-0769-4ff0-a4a4-efb90f13e897",
        title: "SEO + GEO/AEO Content Guide for Product Brands",
        slug: "seo-geo-aeo-content-guide",
        description: null,
        price_cents: 0,
        thumbnail_url: null,
        type: "digital",
      }}
      creator={{ id: "c1", name: "Luca Dragoste", avatar_url: null, username: "lucadragoste" }}
      userEmail="buyer@example.com"
      isLoggedIn={false}
    />
  )
}

createRoot(document.getElementById("app")!).render(q.get("skeleton") ? <CheckoutSkeleton /> : <App />)

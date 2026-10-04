/**
 * The buyer's loading line (components/navigation/route-loading-bar.tsx) over
 * a stand-in for Next's router that really changes the page, for
 * scripts/check-back-stall.mjs. A link press and the browser's own back both
 * land DELAY ms later, so the probe can time what is on screen from the press
 * to the page arriving.
 *
 *   ?delay=2500   how long the page behind takes to draw
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"

const q = new URLSearchParams(location.search)
const DELAY = Number(q.get("delay") || 2500)
const HERE = "/account/library"
const THERE = "/account/library/products/one"

function Page({ path }: { path: string }) {
  const product = path !== HERE
  return (
    <main style={{ minHeight: "100vh", background: "#fafafa" }}>
      <div style={{ height: 56, background: "#ffffff", borderBottom: "1px solid #e5e7eb" }} />
      <div style={{ height: 320, background: product ? "#0f766e" : "#ffffff" }} />
      <h1 style={{ padding: 24, fontSize: 28 }}>{product ? "One product" : "Library"}</h1>
      <a href={THERE} data-open="" style={{ display: "inline-block", margin: 24, padding: "12px 20px", background: "#1a1a2e", color: "#fff", borderRadius: 10 }}>
        Open the product
      </a>
    </main>
  )
}

function App() {
  const [path, setPath] = React.useState(HERE)
  React.useEffect(() => {
    /* The address changes at the press, as the router's does; the page follows DELAY later. */
    const land = (to: string) => window.setTimeout(() => setPath(to), DELAY)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault()
      const to = new URL(a.href).pathname
      history.pushState({}, "", to)
      land(to)
    }
    const onPop = () => land(location.pathname)
    document.addEventListener("click", onClick)
    window.addEventListener("popstate", onPop)
    return () => {
      document.removeEventListener("click", onClick)
      window.removeEventListener("popstate", onPop)
    }
  }, [])
  /* What the bar reads: the address the router has committed, which is `path`, not location. */
  ;(window as unknown as { __path: string }).__path = path
  return (
    <>
      <RouteLoadingBar />
      <Page path={path} />
    </>
  )
}

document.documentElement.classList.add("with-page-library")
createRoot(document.getElementById("app")!).render(<App />)

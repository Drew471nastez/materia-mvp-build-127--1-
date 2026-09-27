/**
 * A PUBLISHED WEBSITE PAGE, WITH ITS TRACKER, AND A ROUTER THAT MOVES BETWEEN PAGES THE WAY NEXT DOES.
 *
 * The real ThemePage (the renderer app/(site)/w/[username] draws a published
 * site with) with its header and footer, and the real <TrackView> the site's
 * pages mount. What Next's app router does on a <Link> is done here by hand:
 * the click is taken, history.pushState moves the address, and the path in
 * Next's own PathnameContext (which usePathname reads) changes, while the
 * page and its tracker stay mounted. A full load is a real navigation, done
 * by the probe. scripts/check-analytics-collection.mjs drives it.
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { TrackView } from "@/components/analytics/track-view"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const CREATOR = "aaaaaaaa-0000-4000-8000-000000000001"
const PRODUCT = "aaaaaaaa-1111-4000-8000-000000000001"

const section = (id: string, type: string): SectionInstance => ({ id, type, name: type, settings: {} }) as SectionInstance
const theme = { background_color: "#ffffff", text_color: "#111111", brand_name: "Ana's shop" } as unknown as ThemeSettingsValues

const PAGES: Record<string, { title: string; body: string }> = {
  "/": { title: "Home", body: "Prints and zines, made in Bucharest." },
  "/about": { title: "About", body: "I draw every day and print on a risograph." },
  "/contact": { title: "Contact", body: "Write to the studio." },
  "/products/zine": { title: "Zine", body: "Forty pages, two colours." },
}

function Site() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    /* Next's <Link>: an in-site link is taken, the address moves, the tree stays. */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[data-link]") as HTMLAnchorElement | null
      if (!a || e.defaultPrevented || e.button !== 0) return
      e.preventDefault()
      window.history.pushState({}, "", a.getAttribute("href")!)
      setPath(window.location.pathname)
    }
    const onPop = () => setPath(window.location.pathname)
    document.addEventListener("click", onClick)
    window.addEventListener("popstate", onPop)
    return () => {
      document.removeEventListener("click", onClick)
      window.removeEventListener("popstate", onPop)
    }
  }, [])
  const page = PAGES[path] ?? { title: "Not found", body: "" }
  const productId = path.startsWith("/products/") ? PRODUCT : undefined
  return (
    <PathnameContext.Provider value={path}>
      <ThemePage theme={theme} sections={[section("h", "header"), section("f", "footer")]} storefront={{ creatorId: CREATOR, installId: "aaaaaaaa-5555-4000-8000-000000000001" }}>
        <main style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
          <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <a data-link href="/">Home</a>
            <a data-link href="/about" id="to-about">About</a>
            <a data-link href="/products/zine" id="to-zine">Zine</a>
            <a href="/contact" id="to-contact">Contact (full load)</a>
            <a href="https://instagram.com/ana.draws?igsh=abc" id="to-instagram" target="_blank" rel="noopener noreferrer">Instagram</a>
          </nav>
          <h1 id="title" style={{ fontSize: 28, fontWeight: 700 }}>{page.title}</h1>
          <p>{page.body}</p>
          {/* A picture that takes a while, as a hero image does on a real site. */}
          <img id="hero" src="/slow-hero.png" alt="" width={320} height={180} style={{ display: "block", marginTop: 24, background: "#eee" }} />
        </main>
      </ThemePage>
      <TrackView type={productId ? "product" : "store"} creatorId={CREATOR} productId={productId} />
    </PathnameContext.Provider>
  )
}

createRoot(document.getElementById("app")!).render(<Site />)

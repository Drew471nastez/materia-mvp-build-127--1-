/**
 * The Overlay group's sections as a visitor's page has them, for
 * scripts/check-overlay-live.ts: each one's live markup (drawn by the engine
 * before the page is built, in window.OVERLAY) in the box SectionRenderer
 * gives an overlay section, under a sticky header, with the page's own hook
 * (components/website-builder/sections/overlay-hooks.ts) running on it.
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { useOverlayHooks } from "@/components/website-builder/sections/overlay-hooks"

const drawn = (window as unknown as { OVERLAY: { id: string; type: string; html: string; css: string }[] }).OVERLAY

function Overlay({ id, type, html }: { id: string; type: string; html: string }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  useOverlayHooks(root, { sectionId: id, inCanvas: false, html })
  return (
    <div data-section-box="" data-section-type={type} data-chrome="" data-overlay="" style={{ position: "relative", zIndex: 70 }}>
      <div data-section="" className="relative w-full isolate" ref={setRoot} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function Page() {
  return (
    <>
      <header data-section-box="" data-chrome="" style={{ position: "sticky", top: 0, zIndex: 40, height: 64, background: "#fff", borderBottom: "1px solid #eee" }}>Header</header>
      <main style={{ height: 3000, background: "linear-gradient(#f8f9fa, #e5e7eb)" }}>Page</main>
      <footer data-section-box="" data-chrome="" style={{ height: 200, background: "#1f2937", color: "#fff" }}>Footer</footer>
      {drawn.map((s) => <Overlay key={s.id} {...s} />)}
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)

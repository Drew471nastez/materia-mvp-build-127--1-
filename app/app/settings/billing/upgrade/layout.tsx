import type React from "react"

/**
 * ===========================================================================
 *  THE PLANS ARE A PAGE OF THEIR OWN
 * ===========================================================================
 * "Make sure the upgrade page behaves like a real full page, its own page
 * rather than awkwardly inserted into Settings."
 *
 * It was drawn inside the shell's content area: the dark header, the sidebar
 * and the phone's nav pill all still around it, and a second bar of its own
 * under the header with a Back and an X that did the same thing. Now it is a
 * layer over the whole window, with one bar across the top that has the way
 * back in it, and the shell's own chrome is under it rather than beside it.
 *
 * It is still a route under /app, so the session checks, the router and the
 * shell's landing (components/app/app-stage.tsx) are the same as everywhere
 * else: it arrives on the same 180ms fade and rise as any other page, and
 * leaves the same way the page it returns to arrives.
 *
 * `data-page-layer` is how the nav pill knows it is covered and steps aside
 * (app/globals.css), so there is nothing to tap through under this page.
 */
export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-page-layer="" className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-[#f8f9fa]">
      {children}
    </div>
  )
}

import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * ===========================================================================
 *  THE PLANS ARE A PAGE OF THEIR OWN
 * ===========================================================================
 * "Make sure the upgrade page behaves like a real full page, its own page
 * rather than awkwardly inserted into Settings."
 *
 * A layer over the whole window (components/app/page-layer.tsx), with one bar
 * across the top that has the way back in it. The shell's header, rail and
 * nav pill are under it and not painted, on a phone, in the native apps and
 * on a computer alike. The strip under the status bar is white, the colour of
 * the page's own bar.
 *
 * It is still a route under /app, so the session checks, the router and the
 * shell's landing (components/app/app-stage.tsx) are the same as everywhere
 * else.
 *
 * ROUND 58, THE OWNER: "it must open and close smoothly and cleanly". On a
 * phone it rises from the bottom over Billing and drops back down on X or
 * Billing, the product editor's move (`moves`, components/app/page-layer.tsx):
 * transform only, on the compositor, nothing under reduced motion. From 768px
 * it is drawn whole on its first frame, as before, and its cards rise in the
 * way /pricing's do.
 */
export default function UpgradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayer inset="white" moves>
      {children}
    </PageLayer>
  )
}

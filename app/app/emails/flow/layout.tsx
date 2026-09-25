import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * An automation, and the list of where to start one. On a phone each is a
 * page of its own, as the product editor is (app/app/products/new/layout.tsx):
 * drawn over the whole window, over the app's black bar, with its own bar at
 * the top that starts under the status bar (./flow-parts.tsx, FlowTopBar).
 * The nav pill stays, and the page keeps room for it at the foot.
 *
 * From 768px it is a page in the shell like any other, with the rail beside
 * it and the black bar above it, and its header 24px under that bar.
 *
 * One layout for both, so choosing a starting point replaces the list with
 * the new automation inside the same layer: nothing leaves and comes back.
 */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageLayer pill inset="bar" phoneOnly>
      {children}
    </PageLayer>
  )
}

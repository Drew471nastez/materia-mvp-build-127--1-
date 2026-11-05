import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * A new product's editor. On a phone it is a page of its own: drawn over the
 * whole window with its own bar at the top, and none of the shell's header
 * above it (components/app/page-layer.tsx). The nav pill stays, as the owner
 * asked, and the editor keeps room for it at the foot.
 *
 * From md it is a page in the shell like any other, with the rail beside it
 * and the header above it, its own bar stuck to the top of the content area:
 * "On desktop large screen the edit product page should be with the sidebar,
 * with the header up there. Not how it is on mobile." From lg that bar moves
 * to the foot of the content area, under a page header and two columns
 * (./product-editor.tsx).
 */
export default function NewProductLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly moves>{children}</PageLayer>
}

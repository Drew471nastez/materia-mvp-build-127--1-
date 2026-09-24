import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * A new product's editor is a page of its own: drawn over the whole window
 * with its own bar at the top, and none of the shell's header above it
 * (components/app/page-layer.tsx). The nav pill stays on a phone, as the
 * owner asked, and the editor keeps room for it at the foot.
 */
export default function NewProductLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill>{children}</PageLayer>
}

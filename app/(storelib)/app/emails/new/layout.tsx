import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * A new email. On a phone it is a page of its own over the whole screen,
 * "full screen, they don't need the black bar at the top": no /app header
 * and no nav pill, its own bar at the top under the status bar, and its
 * actions at the foot (components/email/compose/composer.tsx). The same layer
 * the product editor and the automation pages use
 * (components/app/page-layer.tsx), so it comes and goes the way they do.
 *
 * From 768px it is a page in the shell like any other, with the rail beside
 * it and the black bar above it.
 */
export default function NewEmailLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer inset="page" phoneOnly>{children}</PageLayer>
}

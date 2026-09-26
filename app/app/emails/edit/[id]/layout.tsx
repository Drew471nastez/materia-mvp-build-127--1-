import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A draft or a scheduled email: the same full screen layer on a phone as a new one (../../new/layout.tsx). */
export default function EditEmailLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer inset="page" phoneOnly>{children}</PageLayer>
}

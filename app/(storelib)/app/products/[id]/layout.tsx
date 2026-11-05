import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A product's editor, drawn the same way as a new one: see ../new/layout.tsx. */
export default function EditProductLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly moves>{children}</PageLayer>
}

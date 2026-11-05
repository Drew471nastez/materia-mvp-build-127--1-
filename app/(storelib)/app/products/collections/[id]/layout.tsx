import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A saved collection, framed as a new one is (../new/layout.tsx). */
export default function EditCollectionLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

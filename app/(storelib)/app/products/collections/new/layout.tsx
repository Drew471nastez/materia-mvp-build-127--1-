import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A new collection, framed as a size chart is (../../size-charts/new/layout.tsx): a layer of its own on a phone, a page in the shell from md. */
export default function NewCollectionLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

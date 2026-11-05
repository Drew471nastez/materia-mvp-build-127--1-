import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A saved size chart, framed as a new one is (../new/layout.tsx). */
export default function EditSizeChartLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

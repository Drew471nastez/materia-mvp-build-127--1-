import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/** A new size chart, framed as a coupon is (app/app/coupons/new/layout.tsx): a layer of its own on a phone, a page in the shell from md. */
export default function NewSizeChartLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

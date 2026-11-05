import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * A saved coupon's editor, framed as a new one is (../new/layout.tsx).
 * On a phone a page of its own, drawn over the whole window with its own bar
 * at the top and none of the shell's header above it; the nav pill stays, as
 * it does over the product editor. From md a page in the shell like any
 * other, under the header and beside the rail (components/app/page-layer.tsx,
 * the product editor's layout: app/app/products/new/layout.tsx).
 */
export default function EditCouponLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

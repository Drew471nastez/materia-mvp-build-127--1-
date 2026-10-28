import type React from "react"
import { PageLayer } from "@/components/app/page-layer"

/**
 * A new offer, framed as a coupon is (app/app/coupons/new/layout.tsx): on a
 * phone a page of its own over the whole window with its own bar at the top;
 * from md a page in the shell under the header and beside the rail.
 */
export default function NewOfferLayout({ children }: { children: React.ReactNode }) {
  return <PageLayer pill inset="bar" phoneOnly>{children}</PageLayer>
}

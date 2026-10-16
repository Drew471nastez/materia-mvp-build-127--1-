"use client"

/**
 * The frame every Reviews page draws in (app/app/reviews/layout.tsx): the
 * pane that scrolls, and on it the bar with the title and the tabs
 * (./reviews-nav.tsx), sticky so the tabs are in reach anywhere down a long
 * list. Drawn once for the whole area, so moving between tabs swaps only the
 * page under it and the pane keeps its entrance to the first visit.
 *
 * The bar is the Orders and Coupons one (PaneBar): the pane's own width,
 * its hairline only once something has scrolled under it.
 */
import * as React from "react"
import { usePathname } from "next/navigation"
import { PaneBar } from "@/app/app/orders/order-parts"
import { tt } from "@/lib/i18n/text"
import { ReviewsNav } from "./reviews-nav"

export function ReviewsShell({ pending, children }: { pending: number; children: React.ReactNode }) {
  const pathname = usePathname()
  const paneRef = React.useRef<HTMLDivElement>(null)
  /* A new tab starts at its top, as a new page would. */
  React.useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [pathname])
  return (
    <div ref={paneRef} className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-reviews-area="">
      <PaneBar width="max-w-[1200px]" className="pb-1.5 pt-[14px] md:pt-5">
        <h1 className="text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{tt("Reviews")}</h1>
        <ReviewsNav pending={pending} className="mt-2" />
      </PaneBar>
      {children}
    </div>
  )
}

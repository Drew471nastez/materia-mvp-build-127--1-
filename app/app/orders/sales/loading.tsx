"use client"

import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar } from "../order-parts"
import { OrderSkeleton } from "../order-skeleton"

/**
 * Orders, while the server is still reading them.
 *
 * AN ORDER'S ADDRESS GETS THE ORDER'S OUTLINE. `?order=` is an order opened
 * over the list (../orders-client.tsx), and a link to one used to show the
 * list's skeleton and then, when the data landed, an order with its bar in a
 * different place. Its bar is drawn at once now, the same frame as the real
 * one, and only the cards under it wait (../order-skeleton.tsx).
 *
 * THE LIST'S OUTLINE, otherwise. Most visits never see it: `skeleton-late`
 * keeps it invisible for the first 450ms, and the router keeps a page it
 * already has for five minutes. When it does show, it is the page's outline
 * and nothing more, in the page's own boxes, so the real page lands in the
 * same places.
 */
export default function OrdersLoading() {
  const order = useSearchParams().get("order")
  const bone = "rounded-md bg-[#eef0f2]"
  if (order) {
    return (
      <div className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa]">
        <div className="orders-pane absolute inset-0 overflow-hidden">
          <OrderSkeleton />
        </div>
      </div>
    )
  }
  return (
    <div className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa] skeleton-late">
      <div className="orders-pane absolute inset-0 overflow-hidden">
        <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
          <div className={`${bone} h-7 w-28`} />
          <div className={`${bone} h-8 w-[92px] rounded-lg`} />
        </PaneBar>
        <div className={cn("mx-auto", LIST_WIDTH, GUTTER)}>
          <div className={`${bone} mt-4 h-8 w-[170px] rounded-lg`} />
          <div className="mt-3 h-[96px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          <div className="mt-4 h-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        </div>
      </div>
    </div>
  )
}

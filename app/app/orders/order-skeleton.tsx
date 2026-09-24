/**
 * ===========================================================================
 *  AN ORDER, WHILE THE SERVER IS STILL READING IT
 * ===========================================================================
 * A link straight to an order (an email, a notification, a reload) waits on
 * the server for the creator's orders. The bar is drawn from the first
 * frame, in the same frame as the real one (OrderBarFrame), with grey where
 * the number, statuses and date will be, so when the order lands nothing in
 * the bar moves or changes size. The back arrow already works.
 *
 * The cards are the slow part's outline only, and like every skeleton in
 * /app they stay invisible for the first 450ms (`skeleton-late`), so a fast
 * load goes from the bar straight to the order.
 */

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, ORDER_WIDTH, OrderBarFrame, card, iconButton } from "./order-parts"

const bone = "block rounded-md bg-[#eef0f2]"

export function OrderSkeleton() {
  return (
    <>
      <OrderBarFrame
        back={
          <Link href="/app/orders" aria-label="Back to orders" className={cn(iconButton, "h-9 w-9")}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
        title={
          <>
            <span className={cn(bone, "h-5 w-[60px]")} />
            <span className="flex items-center gap-1.5">
              <span className={cn(bone, "h-[22px] w-[44px] rounded-[7px]")} />
              <span className={cn(bone, "h-[22px] w-[70px] rounded-[7px]")} />
            </span>
          </>
        }
        actions={<span className={cn(bone, "h-8 w-9 rounded-lg sm:w-[124px]")} />}
        subtitle={<span className={cn(bone, "inline-block h-3 w-[200px] max-w-full align-middle")} />}
      />
      <div aria-hidden className={cn("skeleton-late mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start">
          <div className={cn(card, "h-[196px] lg:col-start-1 lg:row-start-1")} />
          <div className={cn(card, "h-[212px] lg:col-start-1 lg:row-start-2")} />
          <div className="grid min-w-0 content-start gap-4 lg:col-start-2 lg:row-span-4 lg:row-start-1">
            <div className={cn(card, "h-[176px]")} />
            <div className={cn(card, "h-[248px]")} />
          </div>
          <div className={cn(card, "h-[260px] lg:col-start-1 lg:row-start-3")} />
        </div>
      </div>
    </>
  )
}

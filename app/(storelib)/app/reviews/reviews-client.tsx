"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { GUTTER, LIST_WIDTH } from "../orders/order-parts"

/**
 * Storelib Reviews' page at /app/reviews: the integration's own page, alone
 * (IntegrationsDirectory `only`), in the pane every /app list page scrolls
 * in. The directory reads ?view= for the tab, as it does under Integrations.
 */
export function ReviewsClient() {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-integrations-scroll="" data-reviews-page="">
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <Suspense fallback={null}>
          <IntegrationsDirectory page only="storelib-reviews" />
        </Suspense>
      </div>
    </div>
  )
}

"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { HowItWorks } from "@/components/app/settings/how-it-works"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar } from "../orders/order-parts"
import { tt } from "@/lib/i18n/text"

/*
  HOW IT WORKS, OUT OF THE WAY (round 30, round K4). A quiet link at the
  bar's right, across from the title, as Orders and Products keep their one
  action there; the bar is sticky, so it stays in reach as the list scrolls.
  The line under the title ("Storelib apps and the services you already
  use.") is gone (round K4): the search is the first thing under the title,
  on a phone too, so How it works sits in the bar there as well.
*/

export function IntegrationsClient() {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-integrations-scroll="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Integrations")}</h1>
        <HowItWorks id="integrations" className="-mr-2" />
      </PaneBar>
      <div className={cn("mx-auto pt-1 pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {/* The directory reads ?integration= to open one's page, and ?category=&q=&status=&by= for the list. */}
        <Suspense fallback={null}>
          <IntegrationsDirectory page />
        </Suspense>
      </div>
    </div>
  )
}

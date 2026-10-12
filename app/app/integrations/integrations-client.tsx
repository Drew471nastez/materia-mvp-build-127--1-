"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { HowItWorks } from "@/components/app/settings/how-it-works"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar } from "../orders/order-parts"

export function IntegrationsClient() {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-integrations-scroll="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Integrations</h1>
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13.5px] text-[#6b7280]">Storelib apps and the services you already use.</p>
          <HowItWorks id="integrations" className="-ml-2" />
        </div>
        {/* The directory reads ?integration= to open one's page. */}
        <Suspense fallback={null}>
          <IntegrationsDirectory page />
        </Suspense>
      </div>
    </div>
  )
}

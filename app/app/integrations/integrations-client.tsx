"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { HowItWorks } from "@/components/app/settings/how-it-works"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar } from "../orders/order-parts"
import { tt } from "@/lib/i18n/text"

/*
  HOW IT WORKS, OUT OF THE WAY (round 30, the owner disliked where it sat).
  It was a pill shaped button after the line under the title, and on a
  phone it wrapped onto a row of its own, a third thing between the title
  and the list. Now:

    from 640px   a quiet link at the bar's right, across from the title, as
                 Orders and Products keep their one action there; the bar is
                 sticky, so it stays in reach as the list scrolls
    a phone      the last words of the line under the title, inline, so the
                 title, its line and the link are one short block and
                 nothing new sits above the search and the pills
*/
const INLINE_HOW = "inline h-auto gap-0 rounded-none p-0 align-baseline text-[13.5px] font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-[3px] hover:bg-transparent hover:decoration-[#1a1a2e] [&>svg]:hidden"

export function IntegrationsClient() {
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-integrations-scroll="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Integrations")}</h1>
        <HowItWorks id="integrations" className="-mr-2 hidden sm:inline-flex" />
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <p className="mb-4 text-[13.5px] leading-5 text-[#6b7280]" data-integrations-lede="">
          {tt("Storelib apps and the services you already use.")}
          <span className="sm:hidden">
            {" "}
            <HowItWorks id="integrations" className={INLINE_HOW} />
          </span>
        </p>
        {/* The directory reads ?integration= to open one's page, and ?c= for the pill. */}
        <Suspense fallback={null}>
          <IntegrationsDirectory page />
        </Suspense>
      </div>
    </div>
  )
}

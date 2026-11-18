"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IntegrationsDirectory, type DirectoryInitial } from "@/components/app/settings/integrations-directory"
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

/*
  AN INTEGRATION'S PAGE HAS NO PAGE TITLE (round 27, the owner): only its
  Back to integrations. The bar goes in the same frame the page is drawn,
  from what the directory says it shows (data-integrations-view), not a
  render later from the address, so the page never starts under a title that
  then leaves and pulls everything up.
*/
const NO_BAR_ON_A_PAGE = "[&:has([data-integrations-view=page])>[data-orders-bar]]:hidden"

export function IntegrationsClient({ initial = null }: { initial?: DirectoryInitial | null } = {}) {
  return (
    <div className={cn("orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter", NO_BAR_ON_A_PAGE)} data-integrations-scroll="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Integrations")}</h1>
        <HowItWorks id="integrations" className="-mr-2" />
      </PaneBar>
      {/* Room under the last card for the phone's navigation pill and, in the iOS app, the home indicator under it (0 in a browser). */}
      <div className={cn("mx-auto pt-1 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-8", LIST_WIDTH, GUTTER)}>
        {/* The directory reads ?integration= to open one's page, and ?category=&q=&status=&by= for the list. */}
        <Suspense fallback={null}>
          <IntegrationsDirectory page initial={initial} />
        </Suspense>
      </div>
    </div>
  )
}
